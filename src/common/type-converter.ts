/** Spec field type → TypeScript type. */
export const to: Record<string, string> = {
  string: "string",
  character: "string",
  number: "number",
  integer: "number",
  unsignedinteger: "number",
  smallinteger: "number",
  unsignedsmallinteger: "number",
  biginteger: "number",
  unsignedbiginteger: "number",
  float: "number",
  decimal: "string",
  boolean: "boolean",
  datetime: "Date",
  binary: "string",
  uuid: "string",
  reference: "number",
};

/** TypeScript type → canonical spec field type. */
export const from: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  Date: "datetime",
};

export const toNative = (specType: string): string => {
  const native = to[specType];
  if (native === undefined) throw new Error(`Unknown spec field type: ${specType}`);
  return native;
};

export const fromNative = (nativeType: string): string => {
  const spec = from[nativeType];
  if (spec === undefined) throw new Error(`Unknown native type: ${nativeType}`);
  return spec;
};
