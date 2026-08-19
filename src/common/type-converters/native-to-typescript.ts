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

/** `datasource.id_type` → TypeScript id type. */
const ID_NATIVE: Record<string, string> = {
  integer: "number",
  biginteger: "bigint",
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

export const fromNative = (nativeType: string): string => {
  const spec = from[nativeType];
  if (spec === undefined) {
    throw new Error(`Unknown native type: ${nativeType}`);
  }
  return spec;
};

export const idTypeToNative = (idType: string): string =>
  ID_NATIVE[idType] ?? ID_NATIVE.integer;

export const datetimeToNative = (datetimeRepr: string): string =>
  datetimeRepr === "string" ? toNative("string") : toNative("datetime");

const referencesId = (references: string | undefined): boolean =>
  references !== undefined && references.split(".")[1] === "id";

export const nativeFieldType = (
  ds: { idType: string; datetimeRepr: string },
  field: { name?: string; type: string; references?: string },
): string =>
  field.name === "id" || referencesId(field.references)
    ? idTypeToNative(ds.idType)
    : toNative(
        field.type === "datetime" && ds.datetimeRepr === "string"
          ? "string"
          : field.type,
      );
