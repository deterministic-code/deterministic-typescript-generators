const SCAN_CAP = 4 * 1024;
const TERMINAL_VERBS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE']);
const KNOWN_VERBS = new Set([
  ...TERMINAL_VERBS,
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'PRAGMA',
  'EXPLAIN',
  'VACUUM',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'SAVEPOINT',
  'RELEASE',
  'ATTACH',
  'DETACH',
  'ANALYZE',
  'REINDEX',
]);

function skipCommentsAndWhitespace(sql: string, start: number): number {
  let i = start;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    return i;
  }
  return i;
}

function readIdentifier(sql: string, start: number): string {
  let i = start;
  while (i < sql.length && /[A-Za-z]/.test(sql[i])) i += 1;
  return sql.slice(start, i).toUpperCase();
}

export function extractSqlMethod(sql: string): string {
  if (typeof sql !== 'string') return 'OTHER';
  const scanLen = Math.min(sql.length, SCAN_CAP);
  if (scanLen === 0) return 'OTHER';

  let i = skipCommentsAndWhitespace(sql, 0);
  if (i >= scanLen) return 'OTHER';

  const first = readIdentifier(sql, i);
  if (!first) return 'OTHER';
  if (first !== 'WITH') return KNOWN_VERBS.has(first) ? first : 'OTHER';

  // WITH: walk forward past balanced parens, skipping comments, until we find
  // the next top-level keyword that is a terminal verb.
  i += first.length;
  let depth = 0;
  while (i < scanLen) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? scanLen : nl + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? scanLen : end + 2;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z]/.test(ch)) {
      const word = readIdentifier(sql, i);
      if (TERMINAL_VERBS.has(word)) return word;
      i += word.length;
      continue;
    }
    i += 1;
  }
  return 'OTHER';
}
