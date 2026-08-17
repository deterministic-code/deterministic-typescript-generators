// Runtime-side naming helpers kept in sync with codegen-side scripts/lib/routes-expand.ts (both wrap npm `pluralize`); parity enforced by scripts/__tests__/naming-parity.test.mjs.

import pluralize from 'pluralize';

export function snakeToCamel(name: string): string {
  return name
    .split(/[_-]/)
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

export function snakeToKebab(name: string): string {
  return name.replace(/_/g, '-');
}

/** Pluralize a single token (dictionary-backed, handles irregulars). */
export function pluralizeToken(word: string): string {
  return pluralize.plural(word);
}

/** Singularize a single token. */
export function singularizeToken(word: string): string {
  return pluralize.singular(word);
}

/**
 * Pluralize a multi-token kebab name on the last token only.
 * `backend-type` → `backend-types`. Matches `kebabPlural` from
 * scripts/lib/routes-expand.ts.
 */
export function kebabPlural(name: string): string {
  const kebab = snakeToKebab(name);
  const parts = kebab.split('-');
  parts[parts.length - 1] = pluralizeToken(parts[parts.length - 1]);
  return parts.join('-');
}
