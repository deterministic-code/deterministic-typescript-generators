import { describe, it, expect } from 'vitest';
import { FieldConverter } from '../fieldConverting';
import { FieldMappingTranslator } from '../FieldMappingTranslator';
import { getDefaultConverters } from '../../converters/registry';
import type { ITypeFieldConverter } from '../../converters/ITypeFieldConverter';

const identityTranslator = () => new FieldMappingTranslator(undefined);

const identityConverter = (datasourceType: string): ITypeFieldConverter => ({
  fromDatasource: 'sqlite',
  toLanguage: 'typescript',
  datasourceType,
  from: (v) => v,
  to: (v) => v,
});

describe('FieldConverter.converterFor — declared type with no registered converter throws', () => {
  const build = () =>
    new FieldConverter('sqlite', identityTranslator(), {
      columnTypes: { createdAt: 'datetime' },
      converters: new Map([['string', identityConverter('string')]]),
    });

  it('converterFor throws for a declared type absent from the converters map', () => {
    expect(() => build().converterFor('createdAt')).toThrow(
      /no converter registered for datasource type 'datetime'/,
    );
  });

  it('toStorage surfaces the missing-converter invariant', () => {
    expect(() => build().toStorage('createdAt', '2026-01-01T00:00:00.000Z')).toThrow(
      /no converter registered for datasource type 'datetime'/,
    );
  });

  it('fromStorageRow surfaces the missing-converter invariant', () => {
    expect(() => build().fromStorageRow({ createdAt: '2026-01-01T00:00:00.000Z' })).toThrow(
      /no converter registered for datasource type 'datetime'/,
    );
  });
});

describe('FieldConverter — declared type resolves and converts through the default converters', () => {
  const build = () =>
    new FieldConverter('sqlite', identityTranslator(), {
      columnTypes: { flag: 'boolean' },
      converters: getDefaultConverters('sqlite', 'typescript'),
    });

  it('converterFor resolves the boolean converter for the declared column', () => {
    expect(build().converterFor('flag')?.datasourceType).toBe('boolean');
  });

  it('toStorage encodes a boolean to sqlite integer 1', () => {
    expect(build().toStorage('flag', true)).toBe(1);
  });

  it('fromStorageRow decodes sqlite integer 1 back to boolean true', () => {
    expect(build().fromStorageRow({ flag: 1 }).flag).toBe(true);
  });
});

describe('FieldConverter — undeclared columns infer the converter from the value type', () => {
  const build = () =>
    new FieldConverter('sqlite', identityTranslator(), {
      columnTypes: { flag: 'boolean' },
      converters: getDefaultConverters('sqlite', 'typescript'),
    });

  it('converterFor returns undefined for a column not in columnTypes', () => {
    expect(build().converterFor('created')).toBeUndefined();
  });

  it('toStorage passes a non-boolean/non-Date value through unchanged', () => {
    expect(build().toStorage('created', '2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('toStorage converts an undeclared boolean via the dialect boolean converter', () => {
    expect(build().toStorage('created', true)).toBe(1);
    expect(build().toStorage('created', false)).toBe(0);
  });

  it('toStorage converts an undeclared Date via the dialect datetime converter', () => {
    expect(build().toStorage('created', new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('fromStorageRow returns undeclared columns unchanged', () => {
    const row = build().fromStorageRow({ created: 'x', id: 5 });
    expect(row).toEqual({ created: 'x', id: 5 });
  });
});

describe('FieldConverter — custom fieldConverters take precedence over columnTypes', () => {
  it('converterFor returns the custom converter even when a columnTypes converter exists', () => {
    const custom = identityConverter('custom-marker');
    const converter = new FieldConverter('sqlite', identityTranslator(), {
      columnTypes: { flag: 'boolean' },
      converters: getDefaultConverters('sqlite', 'typescript'),
      fieldConverters: new Map([['flag', custom]]),
    });
    expect(converter.converterFor('flag')).toBe(custom);
    expect(converter.converterFor('flag')?.datasourceType).toBe('custom-marker');
  });
});

describe('FieldConverter — empty columnTypes still serializes boolean/Date via the dialect converter', () => {
  const build = () =>
    new FieldConverter('sqlite', identityTranslator(), {
      converters: getDefaultConverters('sqlite', 'typescript'),
    });

  it('converterFor returns undefined for any column when columnTypes is empty', () => {
    expect(build().converterFor('flag')).toBeUndefined();
    expect(build().converterFor('anything')).toBeUndefined();
  });

  it('toStorage infers boolean→1/0 while fromStorageRow leaves undeclared columns raw', () => {
    expect(build().toStorage('flag', true)).toBe(1);
    expect(build().fromStorageRow({ flag: 1, name: 'a' })).toEqual({ flag: 1, name: 'a' });
  });
});
