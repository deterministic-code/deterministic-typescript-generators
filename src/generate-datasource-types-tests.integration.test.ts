import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import { DATASOURCE_TYPES_YAML } from "./common/parse-datasource-types.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-datasource-types-tests.ts";

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
        - active:
            type: boolean
        - balance:
            type: decimal
        - avatar:
            type: binary
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

describe("generate datasource types tests", () => {
  const generateWith = (settings: Record<string, string> = {}) =>
    generate({
      reader: fixtureReader(),
      settings,
    });

  const userBody = async (settings: Record<string, string> = {}) => {
    const map = indexEntries(await generateWith(settings));
    const userFile = [...map.keys()].find((name) =>
      name.endsWith("user.test.ts"),
    );
    assert.ok(userFile, "missing user.test.ts generate entry");
    return entryBody(requireEntry(map, userFile));
  };

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

  it("emits one test file per datasource type", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual([...byName.keys()].sort(), ["role.test.ts", "user.test.ts"]);
  });

  it("nests tests under features/__tests__ when organize_by_feature is set", async () => {
    const nested = await generateWith({
      "other.organize_by_feature": "true",
    });
    assert.deepEqual(
      nested.map((e) => e.filename).sort(),
      [
        "features/role/__tests__/role.test.ts",
        "features/user/__tests__/user.test.ts",
      ],
    );
  });

  it("imports the generated type from the sibling module", async () => {
    const user = await userBody();
    assert.match(user, /import type \{ User \} from "\.\.\/user";/);
    assert.match(user, /from "vitest"/);
    assert.match(user, /const sample = \(\): User => \(/);
  });

  it("covers getters and setters for system columns and declared fields", async () => {
    const user = await userBody();
    const fields = [
      "id",
      "uuid",
      "created",
      "updated",
      "email",
      "role_id",
      "created_at",
      "nick_name",
      "active",
      "balance",
      "avatar",
    ];
    for (const field of fields) {
      assert.match(user, new RegExp(`it\\("gets ${field}"`));
      assert.match(user, new RegExp(`it\\("sets ${field}"`));
    }
    assert.match(user, /it\("allows setting nick_name to null"/);
    assert.doesNotMatch(user, /it\("allows setting email to null"/);
    assert.match(user, /created: new Date\("2024-01-01T00:00:00.000Z"\)/);
    assert.match(user, /email: "sample"/);
    assert.match(user, /active: false/);
    assert.match(user, /balance: "0"/);
  });

  it("drops the uuid column and uses string ids when datasource.id_type=uuid", async () => {
    const user = await userBody({ "datasource.id_type": "uuid" });
    assert.match(user, /it\("gets id"/);
    assert.match(user, /it\("sets id"/);
    assert.doesNotMatch(user, /it\("gets uuid"/);
    assert.doesNotMatch(user, /it\("sets uuid"/);
    assert.match(
      user,
      /const initial = "00000000-0000-0000-0000-000000000000";/,
    );
    assert.match(
      user,
      /role_id: "00000000-0000-0000-0000-000000000000"/,
    );
  });

  it("uses bigint literals when datasource.id_type=biginteger", async () => {
    const user = await userBody({ "datasource.id_type": "biginteger" });
    assert.match(user, /id: 1n/);
    assert.match(user, /const next = 2n;/);
    assert.match(user, /const sample = \(\): User =>/);
  });

  it("maps datetime fields to ISO strings when datasource.datetime=string", async () => {
    const user = await userBody({ "datasource.datetime": "string" });
    assert.match(user, /created: "2024-01-01T00:00:00.000Z"/);
    assert.match(user, /created_at: "2024-01-01T00:00:00.000Z"/);
    assert.match(user, /const next = "2024-01-02T00:00:00.000Z";/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const user = await userBody({ "codegen.schema_version": "9.9" });
    assert.match(user, /schema-version: 9.9/);
  });

  it("fields casing changes getter and setter identifiers", async () => {
    const camel = await userBody({
      "languages.typescript.casing.fields": "camel",
    });
    assert.match(camel, /it\("gets nickName"/);
    assert.match(camel, /it\("sets nickName"/);
    assert.match(camel, /value\.nickName = next;/);
    const kebab = await userBody({
      "languages.typescript.casing.fields": "kebab",
    });
    assert.match(kebab, /it\("gets nick-name"/);
    assert.match(kebab, /value\["nick-name"\] = next;/);
  });

  it("types casing changes the imported interface name", async () => {
    const user = await userBody({
      "languages.typescript.casing.types": "camel",
    });
    assert.match(user, /import type \{ user \} from "\.\.\/user";/);
    assert.match(
      user,
      /describe\("user field accessors \(datasource_types\.user\)"/,
    );
  });
});
