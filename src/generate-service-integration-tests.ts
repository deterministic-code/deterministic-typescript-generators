import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { toNative } from "./base-type-converter.ts";
import { servicePaths } from "./common/paths.ts";
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

const tableByName = (
  name: string,
  datasources: ExpandedDatasourceType[],
): ExpandedDatasourceType | undefined => datasources.find((d) => d.name === name);

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const naming = servicePaths(settings);
  const { generics } = deterministic.services;
  const datasources = deterministic.expandedDatasourceTypes;
  const mode = settings["languages.typescript.library_reference_mode"];
  return generics
    .filter((c) => tableByName(c.name, datasources)?.datasourceType === "many-to-many")
    .map((c) => {
      const table = tableByName(c.name, datasources)!;
      const pkField =
        table.fields.find((f) => f.isPrimaryKey === true) ??
        table.fields.find((f) => f.name === "id");
      const path = naming.testPath(c.name).replace(/\.test\.ts$/, ".integration.test.ts");
      const fileBase = naming.fileBase(c.name);
      const isUuid = pkField?.type === "uuid";
      const withUuid = table.fields.some((f) => f.name === "uuid");
      return content(
        path,
        fill(genericTmpl, {
          repositoriesImport: libraryImportSpecifier(
            "repositories",
            mode,
            naming.byFeature
              ? path
              : `services/generated/__tests__/${fileBase}.integration.test.ts`,
          ),
          className: naming.serviceClassName(c.name),
          serviceImport: joinImport("..", fileBase),
          tableNameJson: JSON.stringify(c.name),
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
};

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(SERVICES_YAML);
  return generateFrom(
    await DeterministicParser(ctx.reader).parse(ctx.settings, {
      serviceClassName: servicePaths(ctx.settings).serviceClassName,
    }),
    ctx.settings,
  );
};
