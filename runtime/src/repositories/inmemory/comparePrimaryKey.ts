/** Order two rows' primary keys for `findAll`/`findBy`: numeric and bigint ids sort ascending, any other id shape (string/uuid) keeps insertion order — the in-memory backend's only ordering guarantee for non-numeric keys. */
export function comparePrimaryKeyValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return Number(a - b);
  return 0;
}
