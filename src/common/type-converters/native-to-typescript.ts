/** Spec field type → TypeScript type. */
const to: Record<string, string> = {
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

/** `datasource.id_type` → TypeScript id type. */
const ID_NATIVE: Record<string, string> = {
  integer: "number",
  biginteger: "number",
  uuid: "string",
  string: "string",
};

export const toNative = (specType: string): string => {
  const native = to[specType];
  if (native === undefined) {
    throw new Error(`Unknown spec field type: ${specType}`);
  }
  return native;
};

export const idTypeToNative = (idType: string): string =>
  ID_NATIVE[idType] ?? ID_NATIVE.integer;
