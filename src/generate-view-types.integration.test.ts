import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  fileReader,
  memoryReader,
} from "./common/deterministic-reader.ts";
import { DATASOURCE_TYPES_YAML } from "./common/parse-datasource-types.ts";
import { VIEW_TYPES_YAML } from "./common/parse-view-types.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-view-types.ts";

const DS_YAML = `types:
  - user:
      datasource_type: audit
      fields:
        - email:
            type: string
        - role_id:
            type: number
            references: role.id
        - nick_name:
            type: string
            is_nullable: true
  - role:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
  - tag:
      fields:
        - label:
            type: string
`;

const VIEW_YAML = `includes:
  - datasource_types:
      include: "*"
      auto_enrich: true
types:
  - user_summary:
      inherits: datasource_types.user
      omit:
        - nick_name
      fields:
        - display_name:
            type: string
  - payment:
      one_of:
        - card_payment
        - cash_payment
  - card_payment:
      fields:
        - amount:
            type: decimal
        - paid_at:
            type: datetime
        - tags:
            type: datasource_types.tag[]
        - owner:
            type: user_summary
        - note:
            type: string
            is_nullable: true
  - cash_payment:
      fields:
        - amount:
            type: decimal
`;

const SIMPLE_VIEW_YAML = `types:
  - card_payment:
      fields:
        - amount:
            type: decimal
        - paid_at:
            type: datetime
        - note:
            type: string
            is_nullable: true
`;

const fixtureReader = (
  viewYaml: string = VIEW_YAML,
  dsYaml: string | undefined = DS_YAML,
) =>
  memoryReader({
    [VIEW_TYPES_YAML]: viewYaml,
    ...(dsYaml === undefined ? {} : { [DATASOURCE_TYPES_YAML]: dsYaml }),
  });

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

describe("generate view types", () => {
  const generateWith = (
    settings: Record<string, string> = {},
    viewYaml?: string,
    dsYaml?: string,
  ) =>
    generate({
      reader: fixtureReader(viewYaml, dsYaml),
      settings,
    });

  const bodyOf = async (
    suffix: string,
    settings: Record<string, string> = {},
    viewYaml?: string,
    dsYaml?: string,
  ) => {
    const map = indexEntries(await generateWith(settings, viewYaml, dsYaml));
    const file = [...map.keys()].find((name) => name.endsWith(suffix));
    assert.ok(file, `missing ${suffix} generate entry`);
    return entryBody(requireEntry(map, file));
  };

  it("rejects a missing view_types.yaml", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: {},
        }),
      /missing view_types\.yaml/,
    );
  });

  it("rejects a datasource_types include without datasource_types.yaml", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({
            [VIEW_TYPES_YAML]: `includes:
  - datasource_types:
      include: "*"
types: []
`,
          }),
          settings: {},
        }),
      /no datasource_types\.yaml was provided/,
    );
  });

  it("reads view_types.yaml from a file reader", async () => {
    const dir = await mkdtemp(join(tmpdir(), "generate-view-types-"));
    try {
      await writeFile(join(dir, VIEW_TYPES_YAML), SIMPLE_VIEW_YAML);
      const wrapped = await generate({
        reader: fileReader(dir),
        settings: { "codegen.schema_version": "2.0" },
      });
      const card = entryBody(
        requireEntry(indexEntries(wrapped), "card-payment.ts"),
      );
      assert.match(card, /schema-version: 2\.0/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits one file per expanded view and a barrel by default", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "card-payment.ts",
        "cash-payment.ts",
        "index.ts",
        "payment.ts",
        "role.ts",
        "tag.ts",
        "update-tag.ts",
        "update-user-summary.ts",
        "update-user.ts",
        "user-summary.ts",
        "user.ts",
      ],
    );
  });

  it("renders a shaped view with primitive, datasource, and view fields", async () => {
    const card = await bodyOf("card-payment.ts");
    assert.match(card, /schema-version: 1\.0/);
    assert.match(card, /import type \{ Tag \} from "\.\.\/datasource\/tag";/);
    assert.match(
      card,
      /import type \{ UserSummary \} from "\.\/user-summary";/,
    );
    assert.match(card, /\/\*\* View CardPayment\. \*\//);
    assert.match(card, /export interface CardPayment \{/);
    assert.match(card, /amount: decimal;/);
    assert.match(card, /paid_at: Date;/);
    assert.match(card, /tags: Tag\[\];/);
    assert.match(card, /owner: UserSummary;/);
    assert.match(card, /note: string \| null;/);
  });

  it("renders a union view", async () => {
    const payment = await bodyOf("payment.ts");
    assert.match(
      payment,
      /import type \{ CardPayment \} from "\.\/card-payment";/,
    );
    assert.match(
      payment,
      /import type \{ CashPayment \} from "\.\/cash-payment";/,
    );
    assert.match(
      payment,
      /export type Payment = CardPayment \| CashPayment;/,
    );
  });

  it("extends the inherited datasource type and omits enrichment FKs plus explicit omit", async () => {
    const summary = await bodyOf("user-summary.ts");
    assert.match(
      summary,
      /import type \{ User \} from "\.\.\/datasource\/user";/,
    );
    assert.match(
      summary,
      /export interface UserSummary extends Omit<User, "role_id" \| "nick_name"> \{/,
    );
    assert.match(summary, /display_name: string;/);
    assert.match(summary, /role_name: string;/);
  });

  it("aliases a colliding inherited datasource class name", async () => {
    const user = await bodyOf("user.ts");
    assert.match(
      user,
      /import type \{ User as UserBase \} from "\.\.\/datasource\/user";/,
    );
    assert.match(
      user,
      /export interface User extends Omit<UserBase, "role_id"> \{/,
    );
    assert.match(user, /role_name: string;/);
  });

  it("nests files under features/ when organize_by_feature is set", async () => {
    const nested = await generateWith({
      "other.organize_by_feature": "true",
    });
    const names = nested.map((e) => e.filename).sort();
    assert.ok(names.includes("features/user/user-view.ts"));
    assert.ok(names.includes("features/user/update-user.ts"));
    assert.ok(names.includes("features/user-summary/user-summary-view.ts"));
    assert.ok(names.includes("features/card-payment/card-payment-view.ts"));
    assert.equal(
      names.some((n) => n === "index.ts"),
      false,
    );
  });

  it("uses by-feature import specifiers", async () => {
    const card = await bodyOf("card-payment-view.ts", {
      "other.organize_by_feature": "true",
    });
    assert.match(card, /from "\.\.\/tag\/tag"/);
    assert.match(card, /from "\.\.\/user-summary\/user-summary-view"/);
    const user = await bodyOf("user-view.ts", {
      "other.organize_by_feature": "true",
    });
    assert.match(user, /from "\.\/user"/);
  });

  it("skips the barrel when codegen.create_index is false", async () => {
    const emitted = await generateWith({ "codegen.create_index": "false" });
    assert.equal(
      emitted.some((e) => e.filename === "index.ts"),
      false,
    );
  });

  it("writes the barrel with type re-exports", async () => {
    const index = await bodyOf("index.ts");
    assert.match(index, /export type \{ User \} from "\.\/user";/);
    assert.match(index, /export type \{ Payment \} from "\.\/payment";/);
    assert.match(
      index,
      /export type \{ UserSummary \} from "\.\/user-summary";/,
    );
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf("card-payment.ts", {
      "codegen.schema_version": "9.9",
    });
    assert.match(card, /schema-version: 9.9/);
  });

  it("comments=description emits the multi-line view doc", async () => {
    const card = await bodyOf("card-payment.ts", { comments: "description" });
    assert.match(card, /\* View CardPayment\./);
    assert.match(card, /\* Datasource type: standard\./);
    assert.match(card, /\* Target: ShapedView\./);
    assert.match(card, /\* Fields: 5\./);
    const payment = await bodyOf("payment.ts", { comments: "description" });
    assert.match(payment, /\* Target: UnionView\./);
  });

  it("comments=none omits the view doc", async () => {
    const card = await bodyOf("card-payment.ts", { comments: "none" });
    assert.doesNotMatch(card, /\/\*\*/);
    assert.doesNotMatch(card, /View CardPayment/);
  });

  it("datasource.datetime=string maps datetime fields to string", async () => {
    const card = await bodyOf("card-payment.ts", {
      "datasource.datetime": "string",
    });
    assert.match(card, /paid_at: string;/);
  });

  it("types casing changes the interface name", async () => {
    const card = await bodyOf("card-payment.ts", {
      "languages.typescript.casing.types": "camel",
    });
    assert.match(card, /export interface cardPayment \{/);
  });

  it("fields casing changes property identifiers and Omit keys", async () => {
    const camel = await bodyOf("user-summary.ts", {
      "languages.typescript.casing.fields": "camel",
    });
    assert.match(camel, /displayName: string;/);
    assert.match(camel, /roleName: string;/);
    assert.match(camel, /Omit<User, "roleId" \| "nickName">/);
    const kebab = await bodyOf("card-payment.ts", {
      "languages.typescript.casing.fields": "kebab",
    });
    assert.match(kebab, /"paid-at": Date;/);
  });

  it("file_names casing changes the emitted filename", async () => {
    const emitted = await generateWith(
      { "languages.typescript.casing.file_names": "pascal" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.equal(
      emitted.some((e) => e.filename === "CardPayment.ts"),
      true,
    );
  });

  it("directories casing changes the feature folder", async () => {
    const nested = await generateWith(
      {
        "other.organize_by_feature": "true",
        "languages.typescript.casing.directories": "pascal",
        "languages.typescript.casing.file_names": "snake",
      },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.deepEqual(
      nested.map((e) => e.filename).sort(),
      ["features/CardPayment/card_payment_view.ts"],
    );
  });
});
