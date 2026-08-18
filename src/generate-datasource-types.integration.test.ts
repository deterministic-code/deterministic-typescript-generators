import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  fileReader,
  memoryReader,
} from "./common/deterministic-reader.ts";
import {
  DATASOURCE_TYPES_YAML,
} from "./common/specification-parser.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-datasource-types.ts";

const FIXTURE_YAML = `types:
  - user:
      datasource_type: audit
      fields:
        - email:
            type: string
            size: 256
        - role_id:
            references: role.id
        - uuid:
            type: uuid
        - created_at:
            type: datetime
        - nick_name:
            type: string
            is_nullable: true
  - role:
      fields:
        - name:
            type: string
`;

const fixtureReader = () =>
  memoryReader({ [DATASOURCE_TYPES_YAML]: FIXTURE_YAML });

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const indexEntries = (entries: GenerateEntry[]): Map<string, GenerateEntry> => {
  const map = new Map<string, GenerateEntry>();
  for (const entry of entries) {
    assert.equal(
      map.has(entry.filename),
      false,
      `duplicate generate entry: ${entry.filename}`,
    );
    map.set(entry.filename, entry);
  }
  return map;
};

const requireEntry = (
  map: Map<string, GenerateEntry>,
  filename: string,
): GenerateEntry => {
  const entry = map.get(filename);
  if (entry === undefined) {
    throw new Error(`missing generate entry: ${filename}`);
  }
  return entry;
};

describe("generate", () => {
  const generateWith = (settings: Record<string, string>) =>
    generate({
      reader: fixtureReader(),
      settings,
    });

  const userBody = async (settings: Record<string, string> = {}) => {
    const map = indexEntries(await generateWith(settings));
    const userFile = [...map.keys()].find((name) => name.endsWith("user.ts"));
    assert.ok(userFile, "missing user.ts generate entry");
    return entryBody(requireEntry(map, userFile));
  };

  it("exists reports presence without a prior pathExists probe", async () => {
    const memory = fixtureReader();
    assert.equal(await memory.exists(DATASOURCE_TYPES_YAML), true);
    assert.equal(await memory.exists("view_types.yaml"), false);
    const dir = await mkdtemp(join(tmpdir(), "generate-datasource-types-"));
    try {
      const files = fileReader(dir);
      assert.equal(await files.exists(DATASOURCE_TYPES_YAML), false);
      await writeFile(join(dir, DATASOURCE_TYPES_YAML), FIXTURE_YAML);
      assert.equal(await files.exists(DATASOURCE_TYPES_YAML), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a missing datasource_types.yaml", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: {},
        }),
      /missing datasource_types\.yaml/,
    );
  });

  it("rejects a missing datasource_types.yaml from a file reader", async () => {
    const dir = await mkdtemp(join(tmpdir(), "generate-datasource-types-"));
    try {
      await assert.rejects(
        () =>
          generate({
            reader: fileReader(dir),
            settings: {},
          }),
        /missing datasource_types\.yaml/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads datasource_types.yaml from a file reader", async () => {
    const dir = await mkdtemp(join(tmpdir(), "generate-datasource-types-"));
    try {
      await writeFile(join(dir, DATASOURCE_TYPES_YAML), FIXTURE_YAML);
      const wrapped = await generate({
        reader: fileReader(dir),
        settings: { "codegen.schema_version": "2.0" },
      });
      const user = entryBody(requireEntry(indexEntries(wrapped), "user.ts"));
      assert.match(user, /schema-version: 2\.0/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits one interface file per datasource type", async () => {
    const byName = indexEntries(
      await generate({
        reader: fixtureReader(),
        settings: {
          application_name: "catalog-api",
          "languages.typescript.library_reference_mode": "npm",
        },
      }),
    );
    assert.deepEqual([...byName.keys()].sort(), ["role.ts", "user.ts"]);
    for (const filename of byName.keys()) {
      assert.equal(filename.startsWith("features/"), false, filename);
      assert.equal(requireEntry(byName, filename).kind, "content");
    }
  });

  it("renders User against StandardDataSourceWithUuid and the npm types library", async () => {
    const user = await userBody({
      application_name: "catalog-api",
      "languages.typescript.library_reference_mode": "npm",
    });
    assert.match(user, /schema-version: 1\.0/);
    assert.match(
      user,
      /from "@deterministic-code\/deterministic\/types"/,
    );
    assert.match(
      user,
      /export interface User extends StandardDataSourceWithUuid<number, string, Date>/,
    );
    assert.match(user, /email: string;/);
    assert.match(user, /role_id: number;/);
    assert.match(user, /uuid: string;/);
    assert.match(user, /created_at: Date;/);
    assert.match(user, /nick_name: string \| null;/);
    assert.doesNotMatch(user, /extends StandardDataSource</);
  });

  it("nests files under features/ when organize_by_feature is set", async () => {
    const nested = await generateWith({
      "other.organize_by_feature": "true",
    });
    assert.deepEqual(
      nested.map((e) => e.filename).sort(),
      ["features/role/role.ts", "features/user/user.ts"],
    );
  });

  it("emits a barrel when codegen.create_index is true", async () => {
    const withIndex = await generateWith({
      "codegen.create_index": "true",
    });
    const map = indexEntries(withIndex);
    const index = entryBody(requireEntry(map, "index.ts"));
    assert.match(index, /export \{ User \} from "\.\/user";/);
    assert.match(index, /export \{ Role \} from "\.\/role";/);
  });

  it("skips the barrel when create_index is combined with organize_by_feature", async () => {
    const nested = await generateWith({
      "codegen.create_index": "true",
      "other.organize_by_feature": "true",
    });
    assert.equal(
      nested.some((e) => e.filename === "index.ts"),
      false,
    );
  });

  it("writes codegen.schema_version into the file header", async () => {
    const user = await userBody({ "codegen.schema_version": "9.9" });
    assert.match(user, /schema-version: 9.9/);
  });

  it("comments=simple emits a one-line type doc", async () => {
    const user = await userBody({ comments: "simple" });
    assert.match(user, /\/\*\* Type User\. \*\//);
    assert.doesNotMatch(user, /Datasource type:/);
  });

  it("comments=description emits the multi-line type doc", async () => {
    const user = await userBody({ comments: "description" });
    assert.match(user, /\/\*\*/);
    assert.match(user, /\* Type User\./);
    assert.match(user, /\* Datasource type: audit\./);
    assert.match(user, /\* Target: StandardCrud\./);
    assert.match(user, /\* Fields: 5\./);
  });

  it("comments=none omits the type doc", async () => {
    const user = await userBody({ comments: "none" });
    assert.doesNotMatch(user, /\/\*\*/);
    assert.doesNotMatch(user, /Type User/);
  });

  it("library_reference_mode=bundled imports the vendored types module", async () => {
    const user = await userBody({
      "languages.typescript.library_reference_mode": "bundled",
    });
    assert.match(
      user,
      /from "\.\.\/\.\.\/\.\.\/_deterministic\/types\.js"/,
    );
  });

  it("bundled imports are relative to the feature file when organize_by_feature is set", async () => {
    const user = await userBody({
      "languages.typescript.library_reference_mode": "bundled",
      "other.organize_by_feature": "true",
    });
    assert.match(user, /from "\.\.\/\.\.\/_deterministic\/types\.js"/);
  });

  it("datasource.id_type=biginteger uses bigint ids", async () => {
    const user = await userBody({ "datasource.id_type": "biginteger" });
    assert.match(
      user,
      /StandardDataSourceWithUuid<bigint, string, Date>/,
    );
  });

  it("datasource.id_type=string uses string ids", async () => {
    const user = await userBody({ "datasource.id_type": "string" });
    assert.match(
      user,
      /StandardDataSourceWithUuid<string, string, Date>/,
    );
  });

  it("datasource.id_type=uuid drops the uuid column and uses StandardDataSource", async () => {
    const user = await userBody({ "datasource.id_type": "uuid" });
    assert.match(user, /export interface User extends StandardDataSource<string, Date>/);
    assert.doesNotMatch(user, /StandardDataSourceWithUuid/);
    assert.doesNotMatch(user, /^\s*uuid:/m);
    assert.match(user, /role_id: string;/);
  });

  it("unknown datasource.id_type falls back to number ids", async () => {
    const user = await userBody({ "datasource.id_type": "mystery" });
    assert.match(
      user,
      /StandardDataSourceWithUuid<number, string, Date>/,
    );
  });

  it("datasource.datetime=string maps datetime fields to string", async () => {
    const user = await userBody({ "datasource.datetime": "string" });
    assert.match(
      user,
      /StandardDataSourceWithUuid<number, string, string>/,
    );
    assert.match(user, /created_at: string;/);
  });

  it("file_names casing changes the emitted filename", async () => {
    const cases: Array<[string, string]> = [
      ["auto", "user.ts"],
      ["kebab", "user.ts"],
      ["camel", "user.ts"],
      ["pascal", "User.ts"],
      ["snake", "user.ts"],
      ["unknown", "user.ts"],
    ];
    for (const [casing, filename] of cases) {
      const emitted = await generateWith({
        "languages.typescript.casing.file_names": casing,
      });
      assert.equal(
        emitted.some((e) => e.filename === filename),
        true,
        `file_names=${casing} should emit ${filename}`,
      );
    }
  });

  it("types casing changes the interface name", async () => {
    const user = await userBody({
      "languages.typescript.casing.types": "camel",
    });
    assert.match(user, /export interface user extends/);
  });

  it("fields casing changes property identifiers", async () => {
    const camel = await userBody({
      "languages.typescript.casing.fields": "camel",
    });
    assert.match(camel, /nickName: string \| null;/);
    const kebab = await userBody({
      "languages.typescript.casing.fields": "kebab",
    });
    assert.match(kebab, /"nick-name": string \| null;/);
  });

  it("directories casing changes the feature folder", async () => {
    const nested = await generateWith({
      "other.organize_by_feature": "true",
      "languages.typescript.casing.directories": "pascal",
      "languages.typescript.casing.file_names": "snake",
    });
    assert.deepEqual(
      nested.map((e) => e.filename).sort(),
      ["features/Role/role.ts", "features/User/user.ts"],
    );
  });
});
