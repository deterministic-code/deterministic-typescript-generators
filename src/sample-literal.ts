import { Buffer } from "node:buffer";
import { SAMPLE_BINARY_BASE64 } from "./field-converter.ts";

export { SAMPLE_BINARY_BASE64 };

export class RawTsExpr {
  source: string;
  constructor(source: string) {
    this.source = source;
  }
}

export class RuntimeValue {
  kind: string;
  datetime: string;
  size: number | undefined;
  constructor(
    kind: string,
    { datetime = "native", size }: { datetime?: string; size?: number } = {},
  ) {
    this.kind = kind;
    this.datetime = datetime;
    this.size = size;
  }
}

const binaryBase64Literal = (value: Uint8Array): string =>
  JSON.stringify(Buffer.from(value).toString("base64"));

const safeKey = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);

export const accessExpr = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`;

const runtimeValueTs = (value: RuntimeValue): string => {
  switch (value.kind) {
    case "uuid":
      return "crypto.randomUUID()";
    case "datetime":
      return value.datetime === "native"
        ? "new Date()"
        : "new Date().toISOString()";
    case "date":
      return "new Date().toISOString().slice(0, 10)";
    case "email":
      return "`${crypto.randomUUID()}@example.com`";
    case "string":
      return Number.isFinite(value.size)
        ? `crypto.randomUUID().slice(0, ${value.size})`
        : "crypto.randomUUID()";
    default:
      throw new Error(
        `runtimeValueTs: unmapped kind ${JSON.stringify(value.kind)}`,
      );
  }
};

export const distinctNextTs = (value: unknown): string => {
  if (value instanceof RuntimeValue) {
    if (value.kind === "datetime") {
      return value.datetime === "native"
        ? "new Date(Date.now() + 86400000)"
        : "new Date(Date.now() + 86400000).toISOString()";
    }
    if (value.kind === "date") {
      return "new Date(Date.now() + 86400000).toISOString().slice(0, 10)";
    }
    return runtimeValueTs(value);
  }
  if (typeof value === "number") return String(value + 1);
  if (typeof value === "bigint") return `${value + 1n}n`;
  if (typeof value === "boolean") return String(!value);
  if (value instanceof Uint8Array)
    return binaryBase64Literal(new Uint8Array([255]));
  if (typeof value === "string") return JSON.stringify(`${value}-next`);
  return serializeSampleValue(value);
};

const serializeLeaf = (value: unknown): string | null => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof RawTsExpr) return value.source;
  if (value instanceof RuntimeValue) return runtimeValueTs(value);
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }
  if (value instanceof Uint8Array) return binaryBase64Literal(value);
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

export const tsLiteral = (value: unknown): string =>
  serializeSampleValue(value, { jsonKeys: true });
