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
  type DatasourceType,
} from "@deterministic-code/generators-common/specification";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-integration-tests.ts";

const tableByName = (
  name: string,
  datasources: DatasourceType[],
): DatasourceType | undefined => datasources.find((d) => d.name === name);

const generateFrom = (
  deterministic: IDeterministic,
  settings: Record<string, string>,
): GenerateEntry[] => {
  const idType = settings["datasource.id_type"] ?? "integer";
  const naming = servicePaths(settings);
  const { generics } = deterministic.services;
  const datasources = deterministic.expandedDatasourceTypes;
  const mode = settings["languages.typescript.library_reference_mode"];
  return generics
    .filter((c) => tableByName(c.name, datasources)?.datasourceType === "many-to-many")
    .map((c) => {
      const path = naming.testPath(c.name).replace(/\.test\.ts$/, ".integration.test.ts");
      const fileBase = naming.fileBase(c.name);
      const isUuid = idType === "uuid";
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
          idTsType: toNative(idType),
          withUuid: idType !== "uuid",
          stampCols:
            idType !== "uuid"
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
