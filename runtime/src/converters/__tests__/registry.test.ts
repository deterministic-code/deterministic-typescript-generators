import { describe, it, expect } from 'vitest';
import { getDefaultConverters } from '../registry';

describe('converter registry', () => {
  it('returns one entry per row in the conversion table for sqlite -> typescript', () => {
    const map = getDefaultConverters('sqlite', 'typescript');
    const expectedTypes = [
      'string',
      'number',
      'integer',
      'biginteger',
      'smallinteger',
      'float',
      'boolean',
      'datetime',
      'binary',
      'uuid',
    ];
    for (const t of expectedTypes) {
      expect(map.has(t), `expected converter for type '${t}'`).toBe(true);
    }
  });

  it('exposes a converter for each non-trivial type that round-trips', () => {
    const map = getDefaultConverters('sqlite', 'typescript');
    const bool = map.get('boolean');
    expect(bool?.to(true)).toBe(1);
    expect(bool?.from(1)).toBe(true);

    const dt = map.get('datetime');
    const d = new Date('2026-01-01T00:00:00.000Z');
    const back = dt?.from(dt?.to(d));
    expect((back as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns identity-style converters for trivial types (no transformation)', () => {
    const map = getDefaultConverters('sqlite', 'typescript');
    const str = map.get('string');
    expect(str?.to('hello')).toBe('hello');
    expect(str?.from('hello')).toBe('hello');

    const num = map.get('number');
    expect(num?.to(42)).toBe(42);
    expect(num?.from(42)).toBe(42);
  });

  it('throws on unsupported language', () => {
    expect(() => getDefaultConverters('sqlite', 'python' as never)).toThrow(/unsupported/i);
    expect(() => getDefaultConverters('mysql', 'python' as never)).toThrow(/unsupported/i);
    expect(() => getDefaultConverters('postgres', 'python' as never)).toThrow(/unsupported/i);
  });

  it('returns mysql variants for mysql -> typescript', () => {
    const map = getDefaultConverters('mysql', 'typescript');
    const bool = map.get('boolean');
    expect(bool?.fromDatasource).toBe('mysql');
    expect(bool?.to(true)).toBe(1);
    expect(bool?.from(1)).toBe(true);
    expect(bool?.from(0)).toBe(false);
  });

  it('returns postgres variants for postgres -> typescript', () => {
    const map = getDefaultConverters('postgres', 'typescript');
    const bool = map.get('boolean');
    expect(bool?.fromDatasource).toBe('postgres');
    expect(bool?.to(true)).toBe(true);
    expect(bool?.from(true)).toBe(true);
    expect(bool?.from(false)).toBe(false);
  });
});
