import { describe, it, expect } from 'vitest';
import { extractSqlMethod } from '../extractSqlMethod';

describe('extractSqlMethod', () => {
  const cases: Array<[string, string, string]> = [
    ['plain SELECT', 'SELECT * FROM users', 'SELECT'],
    ['leading whitespace', '   SELECT 1', 'SELECT'],
    ['lower-case', 'select 1', 'SELECT'],
    ['mixed case', 'SeLeCt 1', 'SELECT'],
    ['INSERT', 'INSERT INTO t VALUES (1)', 'INSERT'],
    ['UPDATE', 'UPDATE t SET a = 1', 'UPDATE'],
    ['DELETE', 'DELETE FROM t WHERE id = 1', 'DELETE'],
    ['MERGE', 'MERGE INTO t USING s ON 1=1 WHEN MATCHED THEN UPDATE', 'MERGE'],
    ['BEGIN tx', 'BEGIN', 'BEGIN'],
    ['COMMIT tx', 'COMMIT', 'COMMIT'],
    ['PRAGMA (sqlite)', 'PRAGMA foreign_keys = ON', 'PRAGMA'],
    ['line comment then SELECT', '-- pick rows\nSELECT 1', 'SELECT'],
    ['block comment then INSERT', '/* hi */ INSERT INTO t VALUES (1)', 'INSERT'],
    ['mixed comments then UPDATE', '-- a\n/* b */ -- c\n  UPDATE t SET x = 1', 'UPDATE'],
    ['WITH cte then SELECT', 'WITH x AS (SELECT 1) SELECT * FROM x', 'SELECT'],
    ['WITH cte then INSERT', 'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x', 'INSERT'],
    ['WITH cte then UPDATE', 'WITH x AS (SELECT 1) UPDATE t SET a = (SELECT 1 FROM x)', 'UPDATE'],
    [
      'WITH cte then DELETE',
      'WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT 1 FROM x)',
      'DELETE',
    ],
    ['WITH lower-case then SELECT', 'with x as (select 1) select * from x', 'SELECT'],
    ['nested parens before terminal verb', 'WITH x AS (SELECT (1)) SELECT 1', 'SELECT'],
    ['unknown verb', 'FOOBAR 1', 'OTHER'],
    ['empty input', '', 'OTHER'],
    ['only comments', '-- nothing\n/* still nothing */', 'OTHER'],
  ];

  for (const [name, sql, expected] of cases) {
    it(`extracts "${expected}" from ${name}`, () => {
      expect(extractSqlMethod(sql)).toBe(expected);
    });
  }

  it('caps scan length so pathological input does not hang', () => {
    const huge = '/*' + 'x'.repeat(10_000) + '*/ SELECT 1';
    expect(extractSqlMethod(huge)).toBe('OTHER');
  });
});
