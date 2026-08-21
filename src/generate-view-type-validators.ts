import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  VIEW_TYPES_YAML,
  type ExpandedViewType,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "@deterministic-code/generators-common/specification";
import { toZod } from "./common/type-converters/native-to-zod.ts";
import { Emit } from "./emit.ts";
import {
  indexTmpl as defaultIndexTmpl,
  schemaInheritTmpl as defaultSchemaInheritTmpl,
  schemaStandaloneTmpl as defaultSchemaStandaloneTmpl,
  schemaUnionTmpl as defaultSchemaUnionTmpl,
  typeTmpl as defaultTypeTmpl,
} from "./resources/view-type-validators.ts";

export type ViewValidatorTemplates = {
  typeTmpl: string;
  indexTmpl: string;
  schemaUnionTmpl: string;
  schemaStandaloneTmpl: string;
  schemaInheritTmpl: string;
};

export type ViewValidatorEmitMode = {
  referenceBackendType?: boolean;
  templates?: ViewValidatorTemplates;
  basePath?: string;
  datasourceBasePath?: string;
};

const omitObj = (keys: string[]) =>
  keys.map((k) => `${JSON.stringify(k)}: true`).join(", ");
const viewOmits = (view: ShapedView, hasUuidColumn: boolean) =>
  view.omit.filter((k) => hasUuidColumn || k !== "uuid");

const tighten = (field: ViewField): string => {
  const base = toZod(field.base);
  switch (field.base) {
    case "string":
    case "character": {
      let expr = `${base}.trim()`;
      if (field.minSize !== undefined && field.minSize >= 0) expr += `.min(${field.minSize})`;
      if (field.size !== undefined && field.size >= 0) expr += `.max(${field.size})`;
      return expr;
    }
    case "number":
    case "integer":
    case "biginteger":
    case "smallinteger":
    case "reference": {
      let expr = `${base}.int()`;
      if (field.name === "id" || field.name.endsWith("_id")) expr += ".nonnegative()";
      if (field.minSize !== undefined) expr += `.min(${field.minSize})`;
      if (field.size !== undefined) expr += `.max(${field.size})`;
      return expr;
    }
    default:
      return base;
  }
};

const indexExports = (
  view: ViewType,
  convertTypes: (text: string) => string,
): string | undefined => {
  const schema = `${convertTypes(view.name)}Schema`;
  if (view.kind === "shaped" && view.omit.length > 0) return undefined;
  if (view.kind === "union") return schema;
  return [
    schema,
    `${convertTypes(`create_${view.name}`)}Schema`,
    `${convertTypes(`update_${view.name}`)}Schema`,
    `${convertTypes(`patch_${view.name}`)}Schema`,
  ].join(", ");
};

class Generator extends Emit {
  private readonly referenceBackendType: boolean;
  private readonly templates: ViewValidatorTemplates;

  constructor(raw: Record<string, string>, mode: ViewValidatorEmitMode) {
    super(raw, mode.basePath ?? ".", mode.datasourceBasePath ?? ".");
    this.referenceBackendType = mode.referenceBackendType ?? true;
    this.templates = mode.templates ?? {
      typeTmpl: defaultTypeTmpl,
      indexTmpl: defaultIndexTmpl,
      schemaUnionTmpl: defaultSchemaUnionTmpl,
      schemaStandaloneTmpl: defaultSchemaStandaloneTmpl,
      schemaInheritTmpl: defaultSchemaInheritTmpl,
    };
  }

  from(deterministic: IDeterministic): GenerateEntry[] {
    const expandedByName = new Map(
      deterministic.expandedViewTypes.map((v) => [v.name, v]),
    );
    const views = deterministic.viewTypes;
    const entries = views.map((view) =>
      content(
        this.imports.viewValidator(view.name),
        fill(this.templates.typeTmpl, {
          schemaVersion: this.settings.schemaVersion,
          imports: this.collectImports(view),
          schemaBody: this.schemaBody(view, expandedByName.get(view.name)),
          withTypeAnnotation: true,
          className: this.casing.convertTypes(view.name),
          schemaName: `${this.casing.convertTypes(view.name)}Schema`,
        }),
      ),
    );
    const index = this.imports.index(
      this.imports.viewValidator(views[0]?.name ?? "index"),
    );
    if (index && this.settings.createIndex) {
      entries.push(
        content(
          index,
          fill(this.templates.indexTmpl, {
            withTypeAnnotation: true,
            types: views.flatMap((view) => {
              const exports = indexExports(view, (text) =>
                this.casing.convertTypes(text),
              );
              if (exports === undefined) return [];
              return [{
                exports,
                className: this.casing.convertTypes(view.name),
                fileBase: this.casing.fileBase(view.name),
              }];
            }),
          }),
        ),
      );
    }
    return entries;
  }

  private zodForField(field: ViewField): string {
    const nested =
      field.kind === "datasource" && this.referenceBackendType
        ? `${this.casing.convertTypes(`datasource_${field.base}`)}Schema`
        : `${this.casing.convertTypes(field.base)}Schema`;
    let expr =
      field.kind === "primitive"
        ? tighten(field)
        : `z.lazy(() => ${nested})`;
    if (field.isArray) expr = `z.array(${expr})`;
    if (field.isNullable) expr += ".nullable()";
    return expr;
  }

  private collectImports(view: ViewType) {
    const byPath = new Map<string, Set<string>>();
    const refs: Array<{ entity: string; kind: "view" | "datasource" }> = [];
    if (view.kind === "shaped") {
      if (this.referenceBackendType && view.inherits !== null) {
        refs.push({ entity: view.inherits, kind: "datasource" });
      }
      for (const f of view.fields) {
        if (f.kind === "datasource" || f.kind === "view") {
          refs.push({
            entity: f.base,
            kind:
              !this.referenceBackendType && f.kind === "datasource"
                ? "view"
                : f.kind,
          });
        }
      }
    } else {
      for (const m of view.members) refs.push({ entity: m, kind: "view" });
    }
    for (const { entity, kind } of refs) {
      if (kind === "view" && entity === view.name) continue;
      const fromPath = this.imports.spec(
        this.imports.viewValidatorRel(view.name),
        kind === "datasource"
          ? this.datasourceImports.datasourceValidatorRel(entity)
          : this.imports.viewValidatorRel(entity),
      );
      const token =
        kind === "datasource"
          ? `${this.casing.convertTypes(entity)}Schema as ${this.casing.convertTypes(`datasource_${entity}`)}Schema`
          : `${this.casing.convertTypes(entity)}Schema`;
      const set = byPath.get(fromPath) ?? new Set();
      set.add(token);
      byPath.set(fromPath, set);
    }
    return [...byPath.entries()]
      .map(([fromPath, tokens]) => ({
        fromPath,
        names: [...tokens].sort().join(", "),
      }))
      .sort((a, b) => a.fromPath.localeCompare(b.fromPath));
  }

  private fieldTokens(fields: ViewField[]) {
    return fields.map((f) => ({
      ident: this.casing.fieldIdent(f.name),
      zodExpr: this.zodForField(f),
    }));
  }

  private schemaBody(
    view: ViewType,
    expanded: ExpandedViewType | undefined,
  ): string {
    const schemaName = `${this.casing.convertTypes(view.name)}Schema`;
    if (view.kind === "union") {
      return fill(this.templates.schemaUnionTmpl, {
        schemaName,
        members: view.members.map((m) => ({
          ident: `${this.casing.convertTypes(m)}Schema`,
        })),
      }).trimEnd();
    }
    const t = {
      create: `${this.casing.convertTypes(`create_${view.name}`)}Schema`,
      update: `${this.casing.convertTypes(`update_${view.name}`)}Schema`,
      patch: `${this.casing.convertTypes(`patch_${view.name}`)}Schema`,
    };
    const inheritBackend = this.referenceBackendType && view.inherits !== null;
    const inlineFields =
      expanded?.kind === "shaped" ? expanded.fields : view.fields;
    const fields = this.fieldTokens(
      inheritBackend ? view.fields : inlineFields,
    );
    const hasUuidColumn =
      expanded?.kind === "shaped" &&
      expanded.fields.some((f) => f.name === "uuid");
    const omits = viewOmits(view, hasUuidColumn);
    const hasTrio = omits.length === 0;
    if (!inheritBackend || view.inherits === null) {
      return fill(this.templates.schemaStandaloneTmpl, {
        schemaName,
        emptyObject: fields.length === 0,
        fields,
        hasTrio,
        createName: t.create,
        updateName: t.update,
        patchName: t.patch,
      }).trimEnd();
    }
    const parent = view.inherits;
    const allOmits = [...view.enrichments.map((e) => e.fkColumn), ...omits];
    const stamp = hasUuidColumn
      ? ["id", "uuid", "created", "updated"]
      : ["id", "created", "updated"];
    return fill(this.templates.schemaInheritTmpl, {
      schemaName,
      dsAlias: `${this.casing.convertTypes(`datasource_${parent}`)}Schema`,
      hasOmits: allOmits.length > 0,
      omitObj: omitObj(allOmits.map((k) => this.casing.convertFields(k))),
      partialId: omits.length > 0 && !omits.includes("id"),
      hasFields: fields.length > 0,
      fields,
      hasTrio,
      updateName: t.update,
      createName: t.create,
      patchName: t.patch,
      updateOmitObj: omitObj(
        [...stamp, ...view.enrichments.map((e) => e.fkColumn)].map((k) =>
          this.casing.convertFields(k),
        ),
      ),
      hasEnrich: view.enrichments.length > 0,
      enrichFields: view.enrichments.map((e) => ({
        ident: JSON.stringify(this.casing.convertFields(e.newField)),
      })),
    }).trimEnd();
  }
}

export const generate = async (
  ctx: GenerateContext,
  mode: ViewValidatorEmitMode = {},
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(VIEW_TYPES_YAML);
  return new Generator(ctx.settings, mode).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
  );
};
