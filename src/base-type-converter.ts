import type { NativeInfo } from "@deterministic-code/generators-common/base-type-converter";
import {
  EMPTY_UUID,
  hexToBytes,
} from "@deterministic-code/generators-common/default-token";

const dq = (value: string): string => JSON.stringify(value);

const numeric: NativeInfo["defaults"] = {
  Numeric: (arg: string) => arg,
  String: (arg: string) => arg,
};

const stringy: NativeInfo["defaults"] = {
  String: dq,
  Numeric: dq,
};

export const conversions: Record<string, NativeInfo> = {
  string: { to: "string", defaults: stringy },
  character: { to: "string", defaults: stringy },
  number: { to: "number", defaults: numeric },
  integer: { to: "number", defaults: numeric },
  unsignedinteger: { to: "number", defaults: numeric },
  smallinteger: { to: "number", defaults: numeric },
  unsignedsmallinteger: { to: "number", defaults: numeric },
  biginteger: { to: "number", defaults: numeric },
  unsignedbiginteger: { to: "number", defaults: numeric },
  float: { to: "number", defaults: numeric },
  decimal: { to: "string", defaults: { ...numeric, String: dq } },
  boolean: {
    to: "boolean",
    defaults: {
      Boolean: (arg: string) => (arg === "true" ? "true" : "false"),
    },
  },
  datetime: {
    to: "Date",
    defaults: {
      Now: () => "new Date()",
      UtcNow: () => "new Date()",
      DateTime: (arg: string) => `new Date(${dq(arg)})`,
    },
  },
  binary: {
    to: "string",
    defaults: {
      Hex: (arg: string) =>
        `new Uint8Array([${hexToBytes(arg).join(", ")}])`,
    },
  },
  uuid: {
    to: "string",
    defaults: {
      NewId: () => "crypto.randomUUID()",
      Empty: () => dq(EMPTY_UUID),
      Uuid: dq,
    },
  },
  reference: { to: "number", defaults: {} },
};

export const toNative = (specType: string): string => {
  const info = conversions[specType];
  if (info === undefined) {
    throw new Error(`Unknown spec field type: ${specType}`);
  }
  return info.to;
};
