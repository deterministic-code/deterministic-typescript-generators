import type { InMemoryTable } from './InMemoryDatasource';
import { columnValueMatches } from './columnValueMatches';

/**
 * The row-scan bodies of `InMemoryCrudRepository`, lifted out of the class so its
 * custom-primary-key variants don't structurally clone `InMemoryStandardRepository`'s
 * `id`-keyed equivalents. Each takes a caller-bound predicate/comparator rather than
 * a column+value pair, keeping the argument count small and the classes decoupled.
 */

/** Rows satisfying `matches`, ordered by `compare`. */
export function filterRows<T>(
  rows: T[],
  matches: (row: T) => boolean,
  compare: (a: T, b: T) => number,
): T[] {
  return rows.filter(matches).sort(compare);
}

/** Remove the first row satisfying `matches` in place, returning whether one was found. */
export function deleteRowByPredicate<T>(rows: T[], matches: (row: T) => boolean): boolean {
  const idx = rows.findIndex(matches);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  return true;
}

/** Drop every row whose `column` equals `value` from the table in place, returning how many were removed. */
export function deleteRowsBy(table: InMemoryTable, column: string, value: unknown): number {
  const before = table.rows.length;
  table.rows = table.rows.filter(
    (r) => !columnValueMatches((r as Record<string, unknown>)[column], value),
  );
  return before - table.rows.length;
}
