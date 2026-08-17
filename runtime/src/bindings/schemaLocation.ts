export type SchemaLocationForm = 'self' | 'id' | 'url' | 'file';

/**
 * Classify a binding's `schema:` string into its location form. `self` is the
 * project's own backend; `id:<ref>` another deterministic; an `http(s)://` URL a
 * remote document; everything else a `file:<path>` local document. Pure so both
 * the browser preview and the Node codegen resolver share one parser.
 */
export function schemaLocationForm(schema: string): SchemaLocationForm {
  const trimmed = schema.trim();
  if (trimmed === 'self') return 'self';
  if (trimmed.startsWith('id:')) return 'id';
  if (/^https?:\/\//.test(trimmed)) return 'url';
  return 'file';
}

/** The editable detail of a `schema:` string with its form prefix stripped (empty for `self`, the raw URL for `url`). */
export function schemaDetail(schema: string): string {
  const trimmed = schema.trim();
  const form = schemaLocationForm(trimmed);
  if (form === 'self') return '';
  if (form === 'id') return trimmed.slice('id:'.length).trim();
  if (form === 'file') return trimmed.replace(/^file:/, '').trim();
  return trimmed;
}
