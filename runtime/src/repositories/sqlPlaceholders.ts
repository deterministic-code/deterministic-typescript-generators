/** Render `count` positional bind placeholders (`?`, `$1`, `:1`, …) joined for an `IN (...)` / `VALUES (...)` list. */
export function placeholderList(placeholder: (index0: number) => string, count: number): string {
  return Array.from({ length: count }, (_, i) => placeholder(i)).join(', ');
}
