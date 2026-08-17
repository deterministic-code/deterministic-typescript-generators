// String/number cross-talk is intentional: Express path params arrive as
// strings (`req.params.id = '5'`), but rows inserted via repository.add
// keep their original JavaScript types (numeric ids stay numbers). Strict
// `===` would silently miss every URL-bound integer-PK lookup. SQL drivers
// already coerce bind parameters server-side, so this brings the in-memory
// repo in line with the SQL contract. We avoid `==` to stay clear of the
// implicit boolean/null cross-talk (`false == 0`, `null == undefined`)
// that's never what a column-vs-value comparison wants.
export function columnValueMatches(rowValue: unknown, queryValue: unknown): boolean {
  if (rowValue === queryValue) return true;
  if (rowValue === null || rowValue === undefined) return false;
  if (queryValue === null || queryValue === undefined) return false;
  const rt = typeof rowValue;
  const qt = typeof queryValue;
  if ((rt === 'number' && qt === 'string') || (rt === 'string' && qt === 'number')) {
    return String(rowValue) === String(queryValue);
  }
  return false;
}
