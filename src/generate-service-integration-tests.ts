import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import { servicePaths } from "./common/paths.ts";
import {
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";
import { genericTmpl } from "./resources/service-integration-tests.ts";

const tableByName = (
  name: string,
  datasources: DatasourceType[],
): DatasourceType | undefined => datasources.find((d) => d.name === name);

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ds = datasourceSettings(ctx.settings);
  const naming = servicePaths(ctx.settings);
  const { generics } = await new SpecificationParser(ctx.reader).loadServices({
    idType: ds.idType,
    serviceClassName: naming.serviceClassName,
  });
  const hasDs = await ctx.reader.exists(DATASOURCE_TYPES_YAML);
  const datasources = hasDs
    ? new SpecificationParser().parseDatasourceTypes({
        yaml: await ctx.reader.read(DATASOURCE_TYPES_YAML),
        idType: ds.idType,
      })
    : [];
  const mode = settingsStr(
    ctx.settings,
    "languages.typescript.library_reference_mode",
  );
  return generics
    .filter((c) => tableByName(c.name, datasources)?.datasourceType === "many-to-many")
    .map((c) => {
      const path = naming.testPath(c.name).replace(/\.test\.ts$/, ".integration.test.ts");
      const fileBase = naming.fileBase(c.name);
      const isUuid = ds.idType === "uuid";
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
          idTsType: ds.tsIdType,
          withUuid: ds.withUuidColumn,
          stampCols: ds.withUuidColumn
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
