import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import {
  DATASOURCE_TYPES_YAML,
  VIEW_TYPES_YAML,
} from "@deterministic-code/generators-common/specification";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-view-type-validators.ts";

const DS_YAML = `types:
  - user:
      datasource_type: audit
      fields:
        - email:
            type: string
            size: 256
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
            min_size: 1
            size: 64
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

describe("generate view type validators", () => {
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

  it("emits one validator per expanded view and a barrel by default", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "card_payment.ts",
        "cash_payment.ts",
        "index.ts",
        "payment.ts",
        "role.ts",
        "tag.ts",
        "update_tag.ts",
        "update_user.ts",
        "update_user_summary.ts",
        "user.ts",
        "user_summary.ts",
      ],
    );
  });

  it("renders a shaped view with primitive, datasource, and view fields plus CRUD trio", async () => {
    const card = await bodyOf("card_payment.ts");
    assert.match(card, /schema-version: 1\.0/);
    assert.match(card, /import \{ z \} from "zod";/);
    assert.match(
      card,
      /import \{ tagSchema as datasource_tagSchema \} from "\.\.\/\.\.\/datasource\/validators\/tag";/,
    );
    assert.match(
      card,
      /import \{ user_summarySchema \} from "\.\/user_summary";/,
    );
    assert.match(card, /export const card_paymentSchema = z\.object\(\{/);
    assert.match(card, /amount: z\.string\(\),/);
    assert.match(card, /paid_at: z\.date\(\),/);
    assert.match(card, /tags: z\.array\(z\.lazy\(\(\) => datasource_tagSchema\)\),/);
    assert.match(card, /owner: z\.lazy\(\(\) => user_summarySchema\),/);
    assert.match(card, /note: z\.string\(\)\.trim\(\)\.nullable\(\),/);
    assert.match(card, /export const create_card_paymentSchema = card_paymentSchema;/);
    assert.match(card, /export const update_card_paymentSchema = card_paymentSchema;/);
    assert.match(
      card,
      /export const patch_card_paymentSchema = card_paymentSchema\.partial\(\);/,
    );
    assert.match(
      card,
      /export type card_paymentValidated = z\.infer<typeof card_paymentSchema>;/,
    );
  });

  it("renders a union view", async () => {
    const payment = await bodyOf("payment.ts");
    assert.match(
      payment,
      /import \{ card_paymentSchema \} from "\.\/card_payment";/,
    );
    assert.match(
      payment,
      /import \{ cash_paymentSchema \} from "\.\/cash_payment";/,
    );
    assert.match(
      payment,
      /export const paymentSchema = z\.union\(\[\n  z\.lazy\(\(\) => card_paymentSchema\),\n  z\.lazy\(\(\) => cash_paymentSchema\),\n\]\);/,
    );
    assert.doesNotMatch(payment, /createPaymentSchema/);
  });

  it("inherits a datasource schema with omit, enrich, and no CRUD trio for omit views", async () => {
    const summary = await bodyOf("user_summary.ts");
    assert.match(
      summary,
      /import \{ userSchema as datasource_userSchema \} from "\.\.\/\.\.\/datasource\/validators\/user";/,
    );
    assert.match(
      summary,
      /export const user_summarySchema = datasource_userSchema\.omit\(\{ "role_id": true, "nick_name": true \}\)\.partial\(\{ id: true \}\)\.extend\(\{\n  display_name: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(64\),\n  role_name: z\.string\(\)\.trim\(\),\n\}\);/,
    );
    assert.doesNotMatch(summary, /create_user_summarySchema/);
    assert.doesNotMatch(summary, /update_user_summarySchema/);
  });

  it("emits CRUD trio for inherited pass-through views", async () => {
    const user = await bodyOf("user.ts");
    assert.match(
      user,
      /import \{ userSchema as datasource_userSchema \} from "\.\.\/\.\.\/datasource\/validators\/user";/,
    );
    assert.match(
      user,
      /export const userSchema = datasource_userSchema\.omit\(\{ "role_id": true \}\)\.extend\(\{\n  role_name: z\.string\(\)\.trim\(\),\n\}\);/,
    );
    assert.match(
      user,
      /export const update_userSchema = datasource_userSchema\.omit\(\{ "id": true, "uuid": true, "created": true, "updated": true, "role_id": true \}\)\.extend\(\{\n  "role_name": z\.string\(\)\.trim\(\),\n\}\);/,
    );
    assert.match(user, /export const create_userSchema = update_userSchema;/);
    assert.match(user, /export const patch_userSchema = update_userSchema\.partial\(\);/);
  });

  it("skips the barrel when codegen.create_index is false", async () => {
    const emitted = await generateWith({ "codegen.create_index": "false" });
    assert.equal(
      emitted.some((e) => e.filename === "index.ts"),
      false,
    );
  });

  it("writes the barrel with schemas and skips omit-only views", async () => {
    const index = await bodyOf("index.ts");
    assert.match(
      index,
      /export \{ card_paymentSchema, create_card_paymentSchema, update_card_paymentSchema, patch_card_paymentSchema \} from "\.\/card_payment";/,
    );
    assert.match(index, /export \{ paymentSchema \} from "\.\/payment";/);
    assert.match(
      index,
      /export type \{ card_paymentValidated \} from "\.\/card_payment";/,
    );
    assert.doesNotMatch(index, /user_summary/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf("card_payment.ts", {
      "codegen.schema_version": "9.9",
    });
    assert.match(card, /schema-version: 9.9/);
  });

  it("datasource.id_type=uuid drops uuid from inherited update omits", async () => {
    const user = await bodyOf("user.ts", { "datasource.id_type": "uuid" });
    assert.match(
      user,
      /export const update_userSchema = datasource_userSchema\.omit\(\{ "id": true, "created": true, "updated": true, "role_id": true \}\)/,
    );
    assert.doesNotMatch(
      user,
      /update_userSchema = datasource_userSchema\.omit\(\{[^}]*"uuid"/,
    );
  });

});
