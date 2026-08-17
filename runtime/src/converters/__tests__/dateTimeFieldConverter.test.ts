import { describe, it, expect } from 'vitest';
import {
  dateTimeFieldConverter,
  mysqlDateTimeFieldConverter,
  postgresDateTimeFieldConverter,
} from '../dateTimeFieldConverter';

describe('dateTimeFieldConverter (sqlite, ISO-string wire)', () => {
  it('declares datasourceType datetime, fromDatasource sqlite, toLanguage typescript', () => {
    expect(dateTimeFieldConverter.datasourceType).toBe('datetime');
    expect(dateTimeFieldConverter.fromDatasource).toBe('sqlite');
    expect(dateTimeFieldConverter.toLanguage).toBe('typescript');
  });

  it('to() serializes Date to ISO 8601 string', () => {
    expect(dateTimeFieldConverter.to(new Date('2026-05-04T12:34:56.789Z'))).toBe(
      '2026-05-04T12:34:56.789Z',
    );
  });

  it('from() parses ISO 8601 string to Date', () => {
    const out = dateTimeFieldConverter.from('2026-05-04T12:34:56.789Z');
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).toISOString()).toBe('2026-05-04T12:34:56.789Z');
  });

  it('round-trips Date <-> ISO string', () => {
    const d = new Date('2020-01-02T03:04:05.000Z');
    const back = dateTimeFieldConverter.from(dateTimeFieldConverter.to(d));
    expect((back as Date).getTime()).toBe(d.getTime());
  });

  it('passes null through in both directions', () => {
    expect(dateTimeFieldConverter.to(null)).toBeNull();
    expect(dateTimeFieldConverter.from(null)).toBeNull();
  });

  it('throws on a malformed datetime string', () => {
    expect(() => dateTimeFieldConverter.from('not-a-date')).toThrow();
  });

  it('throws on non-Date input to to()', () => {
    expect(() => dateTimeFieldConverter.to('2026-05-04' as unknown as Date)).toThrow();
  });

  it('throws on an invalid Date passed to to()', () => {
    expect(() => dateTimeFieldConverter.to(new Date('not-a-date'))).toThrow();
  });

  it('throws on non-string input to from()', () => {
    expect(() => dateTimeFieldConverter.from(123 as unknown as string)).toThrow();
  });
});

const NATIVE_CASES = [
  { dialect: 'mysql', conv: mysqlDateTimeFieldConverter },
  { dialect: 'postgres', conv: postgresDateTimeFieldConverter },
] as const;

describe.each(NATIVE_CASES)('dateTimeFieldConverter ($dialect, native-Date wire)', ({ conv }) => {
  const d = new Date('2026-01-02T03:04:05.678Z');

  it('to() returns the Date instance unchanged (driver handles binding)', () => {
    expect(conv.to(d)).toBe(d);
  });

  it('from() returns the same Date when the driver already returned a Date', () => {
    expect((conv.from(d) as Date).toISOString()).toBe('2026-01-02T03:04:05.678Z');
  });

  it('from() accepts a string and parses it (some drivers return strings for older types)', () => {
    expect((conv.from('2026-01-02T03:04:05.678Z') as Date).toISOString()).toBe(
      '2026-01-02T03:04:05.678Z',
    );
  });

  it('passes null through', () => {
    expect(conv.to(null)).toBeNull();
    expect(conv.from(null)).toBeNull();
  });

  it('throws on invalid Date', () => {
    expect(() => conv.to(new Date('not-a-date'))).toThrow();
    expect(() => conv.from('not-a-date')).toThrow();
  });

  it('throws when from() receives an invalid Date instance', () => {
    expect(() => conv.from(new Date('not-a-date'))).toThrow();
  });

  it('throws on unexpected types', () => {
    expect(() => conv.to(123 as unknown as Date)).toThrow();
    expect(() => conv.from(123 as unknown as string)).toThrow();
  });
});
