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
        "card_payment.test.ts",
        "cash_payment.test.ts",
        "payment.test.ts",
        "tag.test.ts",
        "update_tag.test.ts",
        "update_user.test.ts",
        "update_user_summary.test.ts",
        "user.test.ts",
        "user_summary.test.ts",
      ],
    );
  });

  it("imports the generated type and covers get/set plus null assignment", async () => {
    const card = await bodyOf(
      "card_payment.test.ts",
      {},
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /import type \{ card_payment \} from "\.\.\/card_payment";/);
    assert.match(card, /from "vitest"/);
    assert.match(card, /const sample = \(\): card_payment => \(/);
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
    const card = await bodyOf("card_payment.test.ts");
    assert.match(card, /it\("gets tags"/);
    assert.match(card, /it\("sets tags"/);
    assert.match(card, /it\("gets owner"/);
    assert.match(card, /tags: \[\{\} as tag\]/);
    assert.match(card, /owner: \{\} as user_summary/);
    assert.match(card, /const next = \{\} as user_summary;/);
  });

  it("emits union member accept cases instead of field accessors", async () => {
    const payment = await bodyOf("payment.test.ts");
    assert.match(payment, /import type \{ payment \} from "\.\.\/payment";/);
    assert.match(
      payment,
      /import type \{ card_payment \} from "\.\/card_payment";/,
    );
    assert.match(
      payment,
      /import type \{ cash_payment \} from "\.\/cash_payment";/,
    );
    assert.match(payment, /it\("accepts a card_payment member"/);
    assert.match(payment, /it\("accepts a cash_payment member"/);
    assert.doesNotMatch(payment, /const sample = /);
    assert.doesNotMatch(payment, /it\("gets /);
  });

  it("maps datetime fields to ISO strings when datasource.datetime=string", async () => {
    const card = await bodyOf(
      "card_payment.test.ts",
      { "datasource.datetime": "string" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /paid_at: "2024-01-01T00:00:00.000Z"/);
    assert.match(card, /const next = "2024-01-02T00:00:00.000Z";/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf(
      "card_payment.test.ts",
      { "codegen.schema_version": "9.9" },
      SIMPLE_VIEW_YAML,
      undefined,
    );
    assert.match(card, /schema-version: 9.9/);
  });

  it("covers remaining primitive sample literals", async () => {
    const card = await bodyOf(
      "card_payment.test.ts",
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
      "empty_view.test.ts",
      {},
      `types:
  - empty_view:
      fields: []
  - empty_union:
      one_of: []
`,
      undefined,
    );
    assert.match(empty, /const sample = \(\): empty_view => \(\{\}\);/);
    assert.doesNotMatch(empty, /it\("gets /);
    const union = await bodyOf(
      "empty_union.test.ts",
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
});
