export const isWriteDtoViewName = (name: string): boolean =>
  name.startsWith("update_") ||
  name.startsWith("create_") ||
  name.endsWith("_eager_body") ||
  name.endsWith("_eager_create_body") ||
  name.endsWith("_eager_patch_body") ||
  name.endsWith("_eager_row") ||
  name.endsWith("_eager_create_row");

export const converterTypeForSchema = (schema: {
  type?: unknown;
  format?: unknown;
}): string => {
  const format = typeof schema.format === "string" ? schema.format : undefined;
  if (format === "date-time") return "datetime";
  if (format === "byte") return "binary";
  if (format === "uuid") return "uuid";
  if (format === "date") return "date";
  if (format === "email") return "email";
  if (format === "int32") return "integer";
  if (format === "int64") return "biginteger";
  if (format === "float") return "float";
  if (schema.type === "integer") return "integer";
  if (schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string" || schema.type === undefined) return "string";
  throw new Error(`no converter type for schema ${JSON.stringify(schema)}`);
};
