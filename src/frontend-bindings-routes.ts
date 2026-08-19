/** The self-backend forms the frontend bindings resolve in-process: the legacy `self` sentinel and the 1.0.0 contract's `id:<this backend>` reference. */
export const resolvesToSelf = (schema: unknown): boolean =>
  schema === "self" || (typeof schema === "string" && schema.startsWith("id:"));
