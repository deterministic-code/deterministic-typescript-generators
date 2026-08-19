/** Spec field type → base Zod expression (before size/nullability tighteners). */
const ZOD: Record<string, string> = {
  string: "z.string()",
  character: "z.string()",
  decimal: "z.string()",
  number: "z.number()",
  integer: "z.number()",
  smallinteger: "z.number()",
  float: "z.number()",
  reference: "z.number()",
  biginteger: "z.number()",
  boolean: "z.boolean()",
  binary: "z.string().base64()",
  uuid: "z.string().uuid()",
};

/** `datasource.id_type` → Zod id expression. */
const ID_ZOD: Record<string, string> = {
  integer: "z.number().int().nonnegative()",
  biginteger: "z.bigint()",
  uuid: "z.string().uuid()",
  string: "z.string()",
};

export const toZod = (specType: string, datetimeRepr: string): string => {
  if (specType === "datetime") {
    return datetimeRepr === "native" ? "z.date()" : "z.string()";
  }
  const expr = ZOD[specType];
  if (expr === undefined) {
    throw new Error(`Unknown datasource field type: ${specType}`);
  }
  return expr;
};

export const idTypeToZod = (idType: string): string =>
  ID_ZOD[idType] ?? ID_ZOD.integer;
