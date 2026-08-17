import { describe, it, expect } from 'vitest';
import { FieldMappingTranslator } from '../FieldMappingTranslator';

describe('FieldMappingTranslator — empty / no mappings', () => {
  it('hasMappings is false when constructed with undefined', () => {
    const t = new FieldMappingTranslator(undefined);
    expect(t.hasMappings).toBe(false);
  });

  it('hasMappings is false when constructed with an empty map', () => {
    const t = new FieldMappingTranslator(new Map());
    expect(t.hasMappings).toBe(false);
  });

  it('toPhysical returns the input unchanged when there are no mappings', () => {
    const t = new FieldMappingTranslator(undefined);
    expect(t.toPhysical('anything')).toBe('anything');
  });

  it('toLogical returns the input unchanged when there are no mappings', () => {
    const t = new FieldMappingTranslator(undefined);
    expect(t.toLogical('anything')).toBe('anything');
  });

  it('toPhysicalRow returns the input untouched when there are no mappings', () => {
    const t = new FieldMappingTranslator(undefined);
    const row = { a: 1, b: 2 };
    expect(t.toPhysicalRow(row)).toBe(row);
  });

  it('toLogicalRow returns the input untouched when there are no mappings', () => {
    const t = new FieldMappingTranslator(undefined);
    const row = { a: 1, b: 2 };
    expect(t.toLogicalRow(row)).toBe(row);
  });
});

describe('FieldMappingTranslator — with mappings', () => {
  function makeT(): FieldMappingTranslator {
    return new FieldMappingTranslator(
      new Map([
        ['key', 'Key'],
        ['uuid', 'guid'],
        ['text', '_data'],
      ]),
    );
  }

  it('toPhysical maps a known logical column to its physical name', () => {
    expect(makeT().toPhysical('key')).toBe('Key');
    expect(makeT().toPhysical('uuid')).toBe('guid');
    expect(makeT().toPhysical('text')).toBe('_data');
  });

  it('toPhysical passes through unmapped columns unchanged', () => {
    expect(makeT().toPhysical('urgency')).toBe('urgency');
    expect(makeT().toPhysical('created')).toBe('created');
  });

  it('toLogical reverses a known physical column to its logical name', () => {
    expect(makeT().toLogical('Key')).toBe('key');
    expect(makeT().toLogical('guid')).toBe('uuid');
    expect(makeT().toLogical('_data')).toBe('text');
  });

  it('toLogical passes through unmapped physical columns unchanged', () => {
    expect(makeT().toLogical('urgency')).toBe('urgency');
  });

  it('toPhysicalRow translates every key', () => {
    const out = makeT().toPhysicalRow({
      key: 'n-1',
      uuid: 'u-1',
      text: 'hello',
      urgency: 3,
    });
    expect(out).toEqual({ Key: 'n-1', guid: 'u-1', _data: 'hello', urgency: 3 });
  });

  it('toLogicalRow translates every key', () => {
    const out = makeT().toLogicalRow({
      Key: 'n-1',
      guid: 'u-1',
      _data: 'hello',
      urgency: 3,
    });
    expect(out).toEqual({ key: 'n-1', uuid: 'u-1', text: 'hello', urgency: 3 });
  });

  it('toPhysicalRow ↔ toLogicalRow round-trips', () => {
    const t = makeT();
    const logical = { key: 'n-1', uuid: 'u-1', text: 'hello', urgency: 3 };
    expect(t.toLogicalRow(t.toPhysicalRow(logical) as never)).toEqual(logical);
  });

  it('preserves null / undefined / boolean values', () => {
    const t = makeT();
    const out = t.toPhysicalRow({
      key: null,
      uuid: undefined,
      text: false,
    } as unknown as Record<string, unknown>);
    expect(out).toEqual({ Key: null, guid: undefined, _data: false });
  });

  it('throws when two logical columns map to the same physical column', () => {
    expect(
      () =>
        new FieldMappingTranslator(
          new Map([
            ['a', 'X'],
            ['b', 'X'],
          ]),
        ),
    ).toThrow(/physical column 'X' is mapped from multiple logical columns/);
  });
});
