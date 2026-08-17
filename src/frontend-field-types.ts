/** Render the committed `frontend/src/datasource/model/fieldTypes.generated.ts` from the spec-derived, ordered field-type names — the single-source constant the datasource + views editors build their `FieldType` union on. */
export function renderFrontendFieldTypes(names: string[]): string {
  if (names.length === 0) {
    throw new Error("invariant: no field-type names to render");
  }
  const entries = names.map((name) => `  "${name}",`).join("\n");
  return [`export const ALL_FIELD_TYPES = [`, entries, `] as const;`, ``].join(
    "\n",
  );
}
