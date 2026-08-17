import { describe, it, expect } from 'vitest';
import { int8AsNumberTypes } from '../PostgresDatasource';

const PG_INT8_OID = 20;
const PG_INT4_OID = 23;

const fakePg = {
  types: {
    getTypeParser: (oid: number) => (value: string) => `default:${oid}:${value}`,
  },
} as unknown as typeof import('pg');

describe('int8AsNumberTypes', () => {
  it('parses an int8 (BIGINT) column value into a JS number, not a string', () => {
    const parse = int8AsNumberTypes(fakePg).getTypeParser(PG_INT8_OID);
    const parsed = parse('10000000000');
    expect(typeof parsed).toBe('number');
    expect(parsed).toBe(10_000_000_000);
  });

  it('preserves null for a nullable int8 column', () => {
    const parse = int8AsNumberTypes(fakePg).getTypeParser(PG_INT8_OID);
    expect(parse(null as unknown as string)).toBe(null);
  });

  it('delegates every non-int8 oid to pg default parser', () => {
    const parse = int8AsNumberTypes(fakePg).getTypeParser(PG_INT4_OID);
    expect(parse('7')).toBe('default:23:7');
  });
});
