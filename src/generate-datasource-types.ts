import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  DATASOURCE_TYPES_YAML,
  type ExpandedDatasourceType,
} from "@deterministic-code/generators-common/specification";
import { toNative } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { indexTmpl, typeTmpl } from "./resources/datasource-types.ts";
import { libraryImportSpecifier } from "./library-import.ts";

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const types = deterministic.expandedDatasourceTypes;
    const entries = types.map((dsType) => this.type(dsType));
    const index = this.imports.index(
      this.imports.datasource(types[0]?.name ?? "index"),
    );
    if (this.settings.createIndex && index) {
      entries.push(this.index(types, index));
    }
    return entries;
  }

  private type(dsType: ExpandedDatasourceType): GenerateEntry {
    const { schemaVersion, simpleDoc, descriptionDoc, libraryReferenceMode } =
      this.settings;
    const className = this.casing.convertTypes(dsType.name);
    const fields = dsType.fields.map((f) => ({
      name: f.name,
      ident: this.casing.fieldIdent(f.name),
      tsType: toNative(f.type),
      nullable: f.isNullable,
      isPrimaryKey: f.isPrimaryKey === true,
    }));
    const idField =
      fields.find((f) => f.isPrimaryKey) ?? fields.find((f) => f.name === "id");
    const datetimeField =
      fields.find((f) => f.name === "created") ??
      fields.find((f) => f.name === "updated");
    const typeArgs = [idField?.tsType, datetimeField?.tsType].filter(
      (value): value is string => value !== undefined && value !== "",
    );
    const extendsClause =
      typeArgs.length === 0
        ? ""
        : ` extends StandardDataSource<${typeArgs.join(", ")}>`;
    return content(
      this.imports.datasource(dsType.name),
      fill(typeTmpl, {
        schemaVersion,
        libraryImport: libraryImportSpecifier(
          "types",
          libraryReferenceMode,
          this.imports.datasourceRel(dsType.name),
        ),
        simpleDoc,
        descriptionDoc,
        className,
        datasourceType: dsType.datasourceType,
        fieldCount: String(fields.length),
        extendsClause,
        fields,
      }),
    );
  }

  private index(types: ExpandedDatasourceType[], index: string): GenerateEntry {
    return content(
      index,
      fill(indexTmpl, {
        types: types.map((t) => ({
          className: this.casing.convertTypes(t.name),
          fileBase: this.casing.fileBase(t.name),
        })),
      }),
    );
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(DATASOURCE_TYPES_YAML);
  return new Generator(ctx.settings).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
  );
};
