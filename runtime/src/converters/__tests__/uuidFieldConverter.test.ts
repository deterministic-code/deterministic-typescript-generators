import { describe, it, expect } from 'vitest';
import {
  uuidFieldConverter,
  mysqlUuidFieldConverter,
  postgresUuidFieldConverter,
} from '../uuidFieldConverter';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const CASES = [
  { dialect: 'sqlite', conv: uuidFieldConverter },
  { dialect: 'mysql', conv: mysqlUuidFieldConverter },
  { dialect: 'postgres', conv: postgresUuidFieldConverter },
] as const;

describe.each(CASES)('uuidFieldConverter ($dialect)', ({ dialect, conv }) => {
  it(`declares fromDatasource ${dialect}, datasourceType uuid`, () => {
    expect(conv.fromDatasource).toBe(dialect);
    expect(conv.datasourceType).toBe('uuid');
  });

  it('validates and returns the RFC-4122 string unchanged in both directions', () => {
    expect(conv.to(VALID_UUID)).toBe(VALID_UUID);
    expect(conv.from(VALID_UUID)).toBe(VALID_UUID);
  });

  it('accepts uppercase uuid as well', () => {
    const upper = VALID_UUID.toUpperCase();
    expect(conv.to(upper)).toBe(upper);
    expect(conv.from(upper)).toBe(upper);
  });

  it('passes null through', () => {
    expect(conv.to(null)).toBeNull();
    expect(conv.from(null)).toBeNull();
  });

  it('throws on malformed uuid', () => {
    expect(() => conv.to('not-a-uuid')).toThrow(/RFC-4122/i);
    expect(() => conv.from('00000000-0000-0000-0000')).toThrow(/RFC-4122/i);
  });

  it('throws on non-string input', () => {
    expect(() => conv.to(123 as unknown as string)).toThrow(/RFC-4122/i);
    expect(() => conv.from({} as unknown as string)).toThrow(/RFC-4122/i);
  });
});
