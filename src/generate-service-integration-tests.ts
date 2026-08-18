import { fill } from "./common/fill.ts";
import type { GenerateContext } from "./common/generate-context.ts";
import { content, type GenerateEntry } from "./common/generate-entry.ts";
import { datasourceSettings } from "./common/datasource-settings.ts";
import { typescriptServiceNaming } from "./common/naming.ts";
import {
  SpecificationParser,
  DATASOURCE_TYPES_YAML,
  type DatasourceType,
} from "./common/specification-parser.ts";
import { settingsStr } from "./common/settings.ts";
import { joinImport, libraryImportSpecifier } from "./library-import.ts";

const tmpl = `import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PrimaryKeyService,
  SqliteDatasource,
  SqliteStandardRepository,
} from "{{repositoriesImport}}";
import { {{className}} } from "{{serviceImport}}";

const TABLE_NAME = {{&tableNameJson}};
const primaryKeys = new PrimaryKeyService([
  { entityName: {{&entityNameJson}}, primaryKeyColumn: "id", primaryKeyIdType: {{&pkIdTypeJson}} },
]);

describe("{{className}} (sqlite integration)", () => {
  let tmpDir: string;
  let dbPath: string;
  let datasource: SqliteDatasource;
  let service: {{className}};

  beforeEach(async () => {
    const prebuilt = process.env.npm_package_config_test_db;
    if (!prebuilt) {
      throw new Error(
        "npm_package_config_test_db is unset — run via \`npm test\` so the pretest hook materializes the prebuilt sqlite via migrate-setup --and-up.",
      );
    }
    tmpDir = await mkdtemp(join(tmpdir(), "{{entityName}}-itest-"));
    dbPath = join(tmpDir, "test.db");
    await copyFile(prebuilt, dbPath);
    datasource = new SqliteDatasource({
      dbPath,
      pragmas: ["foreign_keys = ON"],
    });
    await datasource.open();
    await datasource.query(\`DELETE FROM \${TABLE_NAME}\`);
    const repository = new SqliteStandardRepository<{ id: {{idTsType}};{{#withUuid}} uuid: string;{{/withUuid}} created: string; updated: string }>(
      datasource,
      TABLE_NAME,
      { entityName: {{&entityNameJson}}, primaryKeys },
    );
    service = new {{className}}(repository as never{{&serviceOptions}});
  });

  afterEach(async () => {
    await datasource.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("findAll returns [] on an empty table", async () => {
    expect(await service.findAll()).toEqual([]);
  });

  it("create inserts a row and auto-populates {{stampCols}}", async () => {
    const row = await service.create({} as never);
    const r = row as unknown as Record<string, unknown>;
    expect(typeof r.id).toBe("{{idTsType}}");
{{#withUuid}}    expect(typeof r.uuid).toBe("string");
{{/withUuid}}    expect(typeof r.created).toBe("string");
    expect(typeof r.updated).toBe("string");
  });

  it("findById returns null for a missing id", async () => {
    expect(await service.findById({{&missingId}})).toBeNull();
  });

  it("update returns null for a missing id", async () => {
    const result = await service.update({{&missingId}}, {} as never);
    expect(result).toBeNull();
  });

  it("delete returns false when the row does not exist", async () => {
    expect(await service.delete({{&missingId}})).toBe(false);
  });
});
`;

const tableByName = (
  name: string,
  datasources: DatasourceType[],
): DatasourceType | undefined => datasources.find((d) => d.name === name);

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  const ds = datasourceSettings(ctx.settings);
  const naming = typescriptServiceNaming(ctx.settings);
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
        fill(tmpl, {
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
