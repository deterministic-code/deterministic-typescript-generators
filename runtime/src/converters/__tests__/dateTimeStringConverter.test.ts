import { describe, it, expect } from 'vitest';
import {
  dateTimeStringConverter,
  mysqlDateTimeStringConverter,
  postgresDateTimeStringConverter,
} from '../dateTimeStringConverter';

const ISO = '2026-05-04T12:34:56.789Z';

describe('dateTimeStringConverter (string wire, identity passthrough)', () => {
  it('declares datasourceType datetime, fromDatasource sqlite, toLanguage typescript', () => {
    expect(dateTimeStringConverter.datasourceType).toBe('datetime');
    expect(dateTimeStringConverter.fromDatasource).toBe('sqlite');
    expect(dateTimeStringConverter.toLanguage).toBe('typescript');
  });

  it('to() returns the string unchanged', () => {
    expect(dateTimeStringConverter.to(ISO)).toBe(ISO);
  });

  it('from() returns the string unchanged', () => {
    expect(dateTimeStringConverter.from(ISO)).toBe(ISO);
  });

  it('round-trips a string through to() then from()', () => {
    expect(dateTimeStringConverter.from(dateTimeStringConverter.to(ISO))).toBe(ISO);
  });

  it('passes null through in both directions', () => {
    expect(dateTimeStringConverter.to(null)).toBeNull();
    expect(dateTimeStringConverter.from(null)).toBeNull();
  });
});

const DIALECT_INSTANCES = [
  ['sqlite', dateTimeStringConverter],
  ['mysql', mysqlDateTimeStringConverter],
  ['postgres', postgresDateTimeStringConverter],
] as const;

describe.each(DIALECT_INSTANCES)(
  'dateTimeStringConverter dialect instance %s',
  (dialect, converter) => {
    it('declares datasourceType datetime and the correct fromDatasource', () => {
      expect(converter.datasourceType).toBe('datetime');
      expect(converter.fromDatasource).toBe(dialect);
      expect(converter.toLanguage).toBe('typescript');
    });

    it('passes the ISO string through unchanged in both directions', () => {
      expect(converter.to(ISO)).toBe(ISO);
      expect(converter.from(ISO)).toBe(ISO);
    });

    it('passes null through in both directions', () => {
      expect(converter.to(null)).toBeNull();
      expect(converter.from(null)).toBeNull();
    });
  },
);
