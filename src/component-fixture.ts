import {
  datetimeLiteral,
  typescriptHomegrownTestData,
  type IFakeTestData,
} from "./fake-test-data.ts";
import { converterTypeForSchema } from "./schema-helpers.ts";
import { NUMERIC_TYPES } from "./field-converter.ts";

/** A TS source fragment to splice into a fixture tree (faker/homegrown leaf, or a live identifier). */
export class RawTsExpr {
  source: string;
  constructor(source: string) {
    this.source = source;
  }
}

const tsExpr = (source: string): RawTsExpr => new RawTsExpr(source);

const safeKey = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);

export const accessExpr = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`;

const serializeLeaf = (value: unknown): string | null => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof RawTsExpr) return value.source;
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }
  if (typeof value === "object") return null;
  return JSON.stringify(value);
};

export const serializeSampleValue = (
  value: unknown,
  opts: { jsonKeys?: boolean } = {},
): string => {
  const leaf = serializeLeaf(value);
  if (leaf !== null) return leaf;
  const rec = (v: unknown): string => serializeSampleValue(v, opts);
  if (Array.isArray(value)) return `[${value.map(rec).join(", ")}]`;
  const keyOf = (k: string): string =>
    opts.jsonKeys === true ? JSON.stringify(k) : safeKey(k);
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${keyOf(k)}: ${rec(v)}`)
    .join(", ");
  return `{ ${entries} }`;
};

interface SchemaNode {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  pattern?: string;
  maxLength?: number;
  oneOf?: SchemaNode[];
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  nullable?: boolean;
}

type Components = Record<string, SchemaNode>;

interface SampleCtx {
  components: Components;
  datetime: string;
  ident: (key: string) => string;
  nullableVariant: boolean;
  data: IFakeTestData;
}

interface SampleOptions {
  datetime?: string;
  ident?: (key: string) => string;
  data?: IFakeTestData;
}

interface IdentOptions {
  ident?: (key: string) => string;
}

interface Mutation {
  description: string;
  mutate: (fx: Record<string, unknown>) => Record<string, unknown>;
}

interface ScalarSetField {
  key: string;
  next: unknown;
}

const REF_PREFIX = "#/components/schemas/";

function refName(ref: string): string {
  return ref.slice(REF_PREFIX.length);
}

const scalarSample = (schema: SchemaNode, ctx: SampleCtx): unknown => {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  const { data, datetime } = ctx;
  const key = converterTypeForSchema(schema);
  if (NUMERIC_TYPES.has(key)) return tsExpr(data.integer());
  if (key === "boolean") return tsExpr(data.boolean());
  if (key === "uuid") return tsExpr(data.uuid());
  if (key === "datetime") return tsExpr(datetimeLiteral(data, datetime));
  if (key === "date") return tsExpr(data.date());
  if (key === "binary") return tsExpr(data.binary());
  if (key === "email") return tsExpr(data.email());
  // A pattern-constrained string can't take a random value and still match, so keep a stable literal there.
  if (typeof schema.pattern === "string") {
    return Number.isFinite(schema.maxLength)
      ? "sample".slice(0, schema.maxLength) || "s"
      : "sample";
  }
  return tsExpr(
    data.string(
      Number.isFinite(schema.maxLength) ? schema.maxLength : undefined,
    ),
  );
};

// A complete sample value for one schema node: `$ref` resolves through the components map (a re-entered ref yields null, mirroring schema-sample's cycle guard), `oneOf` picks its first member, arrays carry one element, and objects fill EVERY property (not just required) so the value matches the frontend_types interface shape, not only what zod would accept.
function baseSample(
  schema: SchemaNode | undefined,
  ctx: SampleCtx,
  seen: Set<string>,
): unknown {
  if (!schema || typeof schema !== "object") return null;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.has(name)) return null;
    return objectSample(ctx.components[name], ctx, new Set(seen).add(name));
  }
  if (Array.isArray(schema.oneOf)) {
    return baseSample(schema.oneOf[0], ctx, seen);
  }
  if (schema.type === "array") {
    return [baseSample(schema.items, ctx, seen)];
  }
  return scalarSample(schema, ctx);
}

function objectSample(
  schema: SchemaNode | undefined,
  ctx: SampleCtx,
  seen: Set<string>,
): unknown {
  if (!schema || typeof schema !== "object") return null;
  if (schema.$ref || schema.oneOf || schema.type === "array") {
    return baseSample(schema, ctx, seen);
  }
  const out: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  for (const [key, prop] of Object.entries(props)) {
    const outKey = ctx.ident(key);
    if (
      ctx.nullableVariant &&
      prop.nullable === true &&
      prop.type !== "array"
    ) {
      out[outKey] = null;
      continue;
    }
    out[outKey] = baseSample(prop, ctx, seen);
  }
  return out;
}

const IDENTITY = (key: string): string => key;

/** A complete JS value conforming to an arbitrary schema node (inline object, `$ref`, array, or scalar), resolving refs through `components`. The request/response-body counterpart of `sampleForComponent` for client-binding tests, whose bodies are frequently inline rather than named. */
export function sampleForSchema(
  schema: unknown,
  components: unknown,
  {
    datetime = "string",
    ident = IDENTITY,
    data = typescriptHomegrownTestData,
  }: SampleOptions = {},
): unknown {
  return objectSample(
    schema as SchemaNode,
    {
      components: components as Components,
      datetime,
      ident,
      nullableVariant: false,
      data,
    },
    new Set<string>(),
  );
}

/** A complete JS value conforming to component `name`, filling every property so it satisfies both the frontend_types interface and the zod schema. `datetime` picks the date-time representation: `"native"` yields `Date` objects (matching the generated interface), `"string"` yields ISO strings (the wire shape client bodies and `z.coerce.date()` accept). `ident` casing-maps each property key so the fixture matches the generated field names (types/validators pass `CodegenFieldNames.ident`; wire-key bodies pass identity). */
export function sampleForComponent(
  name: string,
  components: unknown,
  {
    datetime = "string",
    ident = IDENTITY,
    data = typescriptHomegrownTestData,
  }: SampleOptions = {},
): Record<string, unknown> {
  const comps = components as Components;
  const schema = comps[name];
  if (!schema)
    throw new Error(`sampleForComponent: unknown component "${name}"`);
  return objectSample(
    schema,
    { components: comps, datetime, ident, nullableVariant: false, data },
    new Set<string>([name]),
  ) as Record<string, unknown>;
}

/** Like `sampleForComponent`, but every top-level nullable field is set to `null` — the payload that proves a `.nullable()` schema accepts null. */
export function nullableVariantForComponent(
  name: string,
  components: unknown,
  {
    datetime = "string",
    ident = IDENTITY,
    data = typescriptHomegrownTestData,
  }: SampleOptions = {},
): unknown {
  const comps = components as Components;
  const schema = comps[name];
  if (!schema)
    throw new Error(`nullableVariantForComponent: unknown component "${name}"`);
  return objectSample(
    schema,
    { components: comps, datetime, ident, nullableVariant: true, data },
    new Set<string>([name]),
  );
}

/** The top-level nullable field names of component `name` (casing-mapped by `ident`) — the set a nullable-variant payload nulls out (empty means no nullable field, so no nullable case is worth generating). */
export function nullableFieldNames(
  name: string,
  components: unknown,
  { ident = IDENTITY }: IdentOptions = {},
): string[] {
  const props = (components as Components)[name]?.properties ?? {};
  return Object.keys(props)
    .filter(
      (key) => props[key].nullable === true && props[key].type !== "array",
    )
    .map(ident);
}

function isPlainScalar(prop: SchemaNode): boolean {
  return (
    !prop.$ref &&
    !prop.oneOf &&
    prop.type !== "array" &&
    (prop.type === "integer" ||
      prop.type === "number" ||
      prop.type === "boolean" ||
      prop.type === "string")
  );
}

// A z.coerce.date() field accepts a number as a timestamp, so a numeric "wrong type" on a date-time field would parse — those fields get no wrong-type mutation. Enums reject any non-member, so a sentinel string is the clean invalid value.
function wrongTypeValue(prop: SchemaNode): unknown {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return "__invalid__";
  if (prop.format === "date-time") return null;
  switch (prop.type) {
    case "string":
      return 123;
    case "integer":
    case "number":
      return "not-a-number";
    case "boolean":
      return "not-a-boolean";
    default:
      return null;
  }
}

/** The invalid-payload mutations for component `name`: dropping or nulling each required (non-nullable) field, and wrong-typing each plain scalar. Each `{ description, mutate }` transforms a valid fixture (keyed by `ident`) into one the zod schema must reject — the negative half of the validators test. */
export function enumerateComponentMutations(
  name: string,
  components: unknown,
  { ident = IDENTITY }: IdentOptions = {},
): Mutation[] {
  const schema = (components as Components)[name] ?? {};
  const props = schema.properties ?? {};
  const required = new Set(
    Array.isArray(schema.required) ? schema.required : [],
  );
  const mutations: Mutation[] = [];
  for (const [key, prop] of Object.entries(props)) {
    const outKey = ident(key);
    if (required.has(key) && prop.nullable !== true) {
      mutations.push({
        description: `missing required field "${outKey}"`,
        mutate: (fx) => {
          const next = { ...fx };
          delete next[outKey];
          return next;
        },
      });
      mutations.push({
        description: `null for non-nullable field "${outKey}"`,
        mutate: (fx) => ({ ...fx, [outKey]: null }),
      });
    }
    if (isPlainScalar(prop)) {
      const bad = wrongTypeValue(prop);
      if (bad !== null) {
        mutations.push({
          description: `wrong type on field "${outKey}"`,
          mutate: (fx) => ({ ...fx, [outKey]: bad }),
        });
      }
    }
  }
  return mutations;
}

// A second, type-correct value for a plain scalar field, used to prove get/set on the frontend_types interface. Enum, uuid, and date-time fields are excluded by scalarSetFields so this only sees plain string/number/boolean.
function nextScalarValue(prop: SchemaNode): unknown {
  switch (prop.type) {
    case "integer":
    case "number":
      return 2;
    case "boolean":
      return false;
    default:
      return "updated";
  }
}

/** The plain-scalar, non-nullable field names of component `name` (casing-mapped by `ident`) whose value can be reassigned in a get/set accessor test, each paired with a type-correct replacement value. Excludes enum / uuid / date-time / ref / array fields whose typed replacement would be fiddly. */
export function scalarSetFields(
  name: string,
  components: unknown,
  { ident = IDENTITY }: IdentOptions = {},
): ScalarSetField[] {
  const props = (components as Components)[name]?.properties ?? {};
  return Object.entries(props)
    .filter(
      ([, prop]) =>
        isPlainScalar(prop) &&
        prop.nullable !== true &&
        !Array.isArray(prop.enum) &&
        prop.format !== "uuid" &&
        prop.format !== "date-time",
    )
    .map(([key, prop]) => ({ key: ident(key), next: nextScalarValue(prop) }));
}
