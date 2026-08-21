import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import pluralize from "pluralize";
import { toNative } from "./base-type-converter.ts";
import {
  DeterministicParser,
  type IDeterministic,
} from "@deterministic-code/generators-common/specification-parser";
import {
  SERVICES_YAML,
  type ExpandedDatasourceType,
} from "@deterministic-code/generators-common/specification";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-integration-tests.ts";
import { createCasing } from "./common/default-casing.ts";
import { Emit } from "./emit.ts";

/** Same last-token rule as SQL `effectiveTableName` — tests must hit the physical table. */
const physicalTableName = (name: string, pluralizeFlag: boolean): string =>
  pluralizeFlag && name
    ? name.replace(/[^_]+$/, (token) => pluralize(token))
    : name;

const tableByName = (
  name: string,
  datasources: ExpandedDatasourceType[],
): ExpandedDatasourceType | undefined => datasources.find((d) => d.name === name);

class Generator extends Emit {
  private readonly pluralizeTableNames: boolean;

  constructor(raw: Record<string, string>) {
    super(raw);
    this.pluralizeTableNames =
      String(raw["datasource.pluralize_datatable_names"]) !== "false";
  }

  from(deterministic: IDeterministic): GenerateEntry[] {
    const { generics } = deterministic.services;
    const datasources = deterministic.expandedDatasourceTypes;
    const mode = this.settings.libraryReferenceMode;
    return generics
      .filter(
        (c) =>
          tableByName(c.name, datasources)?.datasourceType === "many-to-many",
      )
      .map((c) => {
        const table = tableByName(c.name, datasources)!;
        const pkField =
          table.fields.find((f) => f.isPrimaryKey === true) ??
          table.fields.find((f) => f.name === "id");
        const path = this.imports.serviceIntegrationTest(c.name);
        const isUuid = pkField?.type === "uuid";
        const withUuid = table.fields.some((f) => f.name === "uuid");
        return content(
          path,
          fill(genericTmpl, {
            repositoriesImport: libraryImportSpecifier(
              "repositories",
              mode,
              this.imports.serviceIntegrationTestRel(c.name),
            ),
            className: this.casing.serviceClassName(c.name),
            serviceImport: joinImport("..", this.casing.fileBase(`${c.name}_service`)),
            tableNameJson: JSON.stringify(
              physicalTableName(c.name, this.pluralizeTableNames),
            ),
            entityNameJson: JSON.stringify(c.name),
            entityName: c.name,
            pkIdTypeJson: JSON.stringify(isUuid ? "uuid" : "integer"),
            idTsType: toNative(pkField!.type),
            withUuid,
            stampCols: withUuid
              ? "id/uuid/created/updated"
              : "id/created/updated",
            serviceOptions: isUuid ? `, { idType: "uuid" }` : "",
            missingId: isUuid
              ? JSON.stringify("00000000-0000-0000-0000-000000000000")
              : "99999",
          }),
        );
      });
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  const casing = createCasing(ctx.settings);
  return new Generator(ctx.settings).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName: (entity) => casing.serviceClassName(entity),
    }),
  );
};
