import { describe, it, expect } from 'vitest';
import {
  uuidStringConverter,
  mysqlUuidStringConverter,
  postgresUuidStringConverter,
} from '../uuidStringConverter';
import { uuidFieldConverter } from '../uuidFieldConverter';

const RFC = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NOT_A_UUID = 'not-a-uuid';

const DIALECT_INSTANCES = [
  ['sqlite', uuidStringConverter],
  ['mysql', mysqlUuidStringConverter],
  ['postgres', postgresUuidStringConverter],
] as const;

describe.each(DIALECT_INSTANCES)(
  'uuidStringConverter dialect instance %s',
  (dialect, converter) => {
    it('declares datasourceType uuid and the correct fromDatasource', () => {
      expect(converter.datasourceType).toBe('uuid');
      expect(converter.fromDatasource).toBe(dialect);
      expect(converter.toLanguage).toBe('typescript');
    });

    it('passes an RFC-4122 string through unchanged in both directions', () => {
      expect(converter.to(RFC)).toBe(RFC);
      expect(converter.from(RFC)).toBe(RFC);
    });

    it('round-trips a string through to() then from()', () => {
      expect(converter.from(converter.to(RFC))).toBe(RFC);
    });

    it('passes null through in both directions', () => {
      expect(converter.to(null)).toBeNull();
      expect(converter.from(null)).toBeNull();
    });
  },
);

describe('uuidStringConverter does not validate (unlike native uuidFieldConverter)', () => {
  it('passes a non-RFC-4122 string through unchanged where the native converter throws', () => {
    expect(uuidStringConverter.to(NOT_A_UUID)).toBe(NOT_A_UUID);
    expect(uuidStringConverter.from(NOT_A_UUID)).toBe(NOT_A_UUID);
    expect(() => uuidFieldConverter.to(NOT_A_UUID)).toThrow(/RFC-4122/i);
    expect(() => uuidFieldConverter.from(NOT_A_UUID)).toThrow(/RFC-4122/i);
  });
});
