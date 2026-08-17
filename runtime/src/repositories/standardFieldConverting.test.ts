import { describe, it, expect } from 'vitest';
import { getDefaultConverters } from '../converters/registry';
import { StandardFieldConverter, standardInsertEntries } from './standardFieldConverting';

const sqliteConverters = getDefaultConverters('sqlite', 'typescript');
const mysqlConverters = getDefaultConverters('mysql', 'typescript');

describe('StandardFieldConverter (no declared columnTypes)', () => {
  const fc = new StandardFieldConverter(sqliteConverters);

  it('passes strings and numbers through untouched', () => {
    expect(fc.applyTo('name', 'Alice')).toBe('Alice');
    expect(fc.applyTo('age', 42)).toBe(42);
    expect(fc.applyTo('missing', null)).toBeNull();
  });

  it('routes a Date through the datetime converter rather than a hardcoded coercion', () => {
    const d = new Date('2024-01-02T03:04:05.000Z');
    expect(fc.applyTo('created', d)).toBe('2024-01-02T03:04:05.000Z');
  });

  it('routes a boolean through the boolean converter', () => {
    expect(fc.applyTo('active', true)).toBe(1);
    expect(fc.applyTo('active', false)).toBe(0);
  });

  it('keeps a Date native when the dialect datetime converter is native (mysql)', () => {
    const fcMysql = new StandardFieldConverter(mysqlConverters);
    const d = new Date('2024-01-02T03:04:05.000Z');
    expect(fcMysql.applyTo('created', d)).toBe(d);
  });

  it('applyFrom is a no-op when no columnTypes are declared', () => {
    const row = { id: 1, created: '2024-01-02T03:04:05.000Z' };
    expect(fc.applyFrom(row)).toBe(row);
  });
});

describe('StandardFieldConverter (declared columnTypes)', () => {
  const fc = new StandardFieldConverter(sqliteConverters, {
    created: 'datetime',
    active: 'boolean',
  });

  it('converts a declared column via its registered converter', () => {
    const d = new Date('2024-01-02T03:04:05.000Z');
    expect(fc.applyTo('created', d)).toBe('2024-01-02T03:04:05.000Z');
    expect(fc.applyTo('active', true)).toBe(1);
  });

  it('applyFrom decodes declared columns and leaves the rest', () => {
    const out = fc.applyFrom<Record<string, unknown>>({
      id: 7,
      created: '2024-01-02T03:04:05.000Z',
      active: 1,
      name: 'x',
    });
    expect(out['created']).toBeInstanceOf(Date);
    expect((out['created'] as Date).toISOString()).toBe('2024-01-02T03:04:05.000Z');
    expect(out['active']).toBe(true);
    expect(out['name']).toBe('x');
  });

  it('is lenient: a declared-but-unregistered type falls back to inference, not a throw', () => {
    const lenient = new StandardFieldConverter(sqliteConverters, { blob: 'no_such_type' });
    expect(() => lenient.applyTo('blob', 'raw')).not.toThrow();
    expect(lenient.applyTo('blob', 'raw')).toBe('raw');
  });
});

describe('standardInsertEntries', () => {
  const now = new Date('2024-01-02T03:04:05.000Z');

  it('keeps created/updated as the Date and appends the uuid when withUuidColumn', () => {
    const entries = standardInsertEntries(
      { name: 'x' },
      { presetId: undefined, withUuidColumn: true, now },
    );
    expect(entries[0]).toEqual(['name', 'x']);
    expect(entries.map(([k]) => k)).toContain('uuid');
    expect(entries.find(([k]) => k === 'created')?.[1]).toBe(now);
    expect(entries.find(([k]) => k === 'updated')?.[1]).toBe(now);
  });

  it('unshifts a preset id first and omits uuid when withUuidColumn is false', () => {
    const entries = standardInsertEntries(
      { name: 'x' },
      { presetId: 'abc', withUuidColumn: false, now },
    );
    expect(entries[0]).toEqual(['id', 'abc']);
    expect(entries.map(([k]) => k)).not.toContain('uuid');
  });
});
