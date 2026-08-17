import pluralize from 'pluralize';

/**
 * Apply `pluralize_datatable_names` to an entity's YAML key. Multi-token
 * names are pluralized on the last token only (`backend_type` ->
 * `backend_types`).
 *
 * Wraps the npm `pluralize` package, which handles classical irregulars
 * (man -> men), already-plural words (analytics -> analytics), and
 * -f / -fe -> -ves that a naive rule-based pluralizer would mishandle.
 */
export function effectiveTableName(name: string, pluralizeFlag: boolean): string {
  if (!pluralizeFlag) return name;
  if (!name) return name;
  const parts = name.split('_');
  parts[parts.length - 1] = pluralize(parts[parts.length - 1]);
  return parts.join('_');
}
