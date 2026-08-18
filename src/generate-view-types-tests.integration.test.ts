import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./common/deterministic-reader.ts";
import {
  DATASOURCE_TYPES_YAML,
  VIEW_TYPES_YAML,
} from "./common/specification-parser.ts";
import type { GenerateEntry } from "./common/generate-entry.ts";
import { generate } from "./generate-view-types-tests.ts";

const DS_YAML = `types:
  - user:
      datasource_type: audit
      fields:
        - email:
            type: string
        - nick_name:
            type: string
            is_nullable: true
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

describe("generate view types tests", () => {
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

  it("rejects an invalid datasource_types.filter expression", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({
            [VIEW_TYPES_YAML]: `includes:
  - datasource_types:
      include: "*"
      filter: type.datasource_type ===
types: []
`,
            [DATASOURCE_TYPES_YAML]: DS_YAML,
          }),
          settings: {},
        }),
      /datasource_types.filter is not a valid expression/,
    );
  });

  it("emits one accessor test file per expanded view", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "card-payment.test.ts",
        "cash-payment.test.ts",
        "payment.test.ts",
        "tag.test.ts",
        "update-tag.test.ts",
        "update-user-summary.test.ts",
        "update-user.test.ts",
        "user-summary.test.ts",
        "user.test.ts",
      ],
    );
  });

  it("nests tests under features/__tests__ when organize_by_feature is set", async () => {
    const nested = await generateWith(
      { "other.organize_by_feature": "true" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.deepEqual(nested.map((e) => e.filename).sort(), [
      "features/card-payment/__tests__/card-payment-view.test.ts",
    ]);
  });

  it("uses by-feature import specifiers for union members", async () => {
    const payment = await bodyOf("payment-view.test.ts", {
      "other.organize_by_feature": "true",
    });
    assert.match(payment, /from "\.\.\/card-payment\/card-payment-view"/);
    assert.match(payment, /from "\.\.\/cash-payment\/cash-payment-view"/);
  });

  it("imports the generated type and covers get/set plus null assignment", async () => {
    const card = await bodyOf(
      "card-payment.test.ts",
      {},
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /import type \{ CardPayment \} from "\.\.\/card-payment";/);
    assert.match(card, /from "vitest"/);
    assert.match(card, /const sample = \(\): CardPayment => \(/);
    for (const field of ["amount", "paid_at", "note"]) {
      assert.match(card, new RegExp(`it\\("gets ${field}"`));
      assert.match(card, new RegExp(`it\\("sets ${field}"`));
    }
    assert.match(card, /it\("allows setting note to null"/);
    assert.doesNotMatch(card, /it\("allows setting amount to null"/);
    assert.match(card, /amount: "0"/);
    assert.match(card, /paid_at: new Date\("2024-01-01T00:00:00.000Z"\)/);
    assert.match(card, /note: "sample"/);
  });

  it("covers nested datasource and view fields on a shaped view", async () => {
    const card = await bodyOf("card-payment.test.ts");
    assert.match(card, /it\("gets tags"/);
    assert.match(card, /it\("sets tags"/);
    assert.match(card, /it\("gets owner"/);
    assert.match(card, /tags: \[\{\} as Tag\]/);
    assert.match(card, /owner: \{\} as UserSummary/);
    assert.match(card, /const next = \{\} as UserSummary;/);
  });

  it("emits union member accept cases instead of field accessors", async () => {
    const payment = await bodyOf("payment.test.ts");
    assert.match(payment, /import type \{ Payment \} from "\.\.\/payment";/);
    assert.match(
      payment,
      /import type \{ CardPayment \} from "\.\/card-payment";/,
    );
    assert.match(
      payment,
      /import type \{ CashPayment \} from "\.\/cash-payment";/,
    );
    assert.match(payment, /it\("accepts a card_payment member"/);
    assert.match(payment, /it\("accepts a cash_payment member"/);
    assert.doesNotMatch(payment, /const sample = /);
    assert.doesNotMatch(payment, /it\("gets /);
  });

  it("maps datetime fields to ISO strings when datasource.datetime=string", async () => {
    const card = await bodyOf(
      "card-payment.test.ts",
      { "datasource.datetime": "string" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /paid_at: "2024-01-01T00:00:00.000Z"/);
    assert.match(card, /const next = "2024-01-02T00:00:00.000Z";/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf(
      "card-payment.test.ts",
      { "codegen.schema_version": "9.9" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /schema-version: 9.9/);
  });

  it("fields casing changes getter and setter identifiers", async () => {
    const camel = await bodyOf(
      "card-payment.test.ts",
      { "languages.typescript.casing.fields": "camel" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(camel, /it\("gets paidAt"/);
    assert.match(camel, /it\("sets paidAt"/);
    assert.match(camel, /value\.paidAt = next;/);
    const kebab = await bodyOf(
      "card-payment.test.ts",
      { "languages.typescript.casing.fields": "kebab" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(kebab, /it\("gets paid-at"/);
    assert.match(kebab, /value\["paid-at"\] = next;/);
  });

  it("types casing changes the imported interface name", async () => {
    const card = await bodyOf(
      "card-payment.test.ts",
      { "languages.typescript.casing.types": "camel" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /import type \{ cardPayment \} from "\.\.\/card-payment";/);
    assert.match(
      card,
      /describe\("cardPayment field accessors \(view_types\.card_payment\)"/,
    );
  });

  it("covers remaining primitive sample literals", async () => {
    const card = await bodyOf(
      "card-payment.test.ts",
      {},
      `types:
  - card_payment:
      fields:
        - count:
            type: number
        - rank:
            type: integer
        - small_rank:
            type: smallinteger
        - big_rank:
            type: biginteger
        - score:
            type: float
        - active:
            type: boolean
        - token:
            type: uuid
        - avatar:
            type: binary
        - initial:
            type: character
        - ref_id:
            type: reference
        - flags:
            type: boolean[]
`,
      undefined,
    );
    assert.match(card, /count: 1/);
    assert.match(card, /rank: 1/);
    assert.match(card, /score: 1\.0/);
    assert.match(card, /active: false/);
    assert.match(card, /token: "00000000-0000-0000-0000-000000000000"/);
    assert.match(card, /avatar: "AAAAAAAAAAAAAAAAAAAAAA=="/);
    assert.match(card, /initial: "sample"/);
    assert.match(card, /ref_id: 1/);
    assert.match(card, /flags: \[false\]/);
  });

  it("renders empty shaped and union views", async () => {
    const empty = await bodyOf(
      "empty-view.test.ts",
      {},
      `types:
  - empty_view:
      fields: []
  - empty_union:
      one_of: []
`,
      undefined,
    );
    assert.match(empty, /const sample = \(\): EmptyView => \(\{\}\);/);
    assert.doesNotMatch(empty, /it\("gets /);
    const union = await bodyOf(
      "empty-union.test.ts",
      {},
      `types:
  - empty_view:
      fields: []
  - empty_union:
      one_of: []
`,
      undefined,
    );
    assert.doesNotMatch(union, /it\("accepts a /);
  });

  it("file_names casing changes the emitted filename", async () => {
    const emitted = await generateWith(
      { "languages.typescript.casing.file_names": "pascal" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.equal(
      emitted.some((e) => e.filename === "CardPayment.test.ts"),
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
      ["features/CardPayment/__tests__/card_payment_view.test.ts"],
    );
  });
});
