import { describe, it, expect } from 'vitest';
import { getDefaultConverters } from '../registry';
import type { SupportedDatasource } from '../ITypeFieldConverter';

const ALL_TYPES = [
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

describe('converter registry parity across datasources', () => {
  for (const ds of ['sqlite', 'mysql', 'postgres'] as SupportedDatasource[]) {
    it(`${ds}: exposes a converter for every datasource type`, () => {
      const map = getDefaultConverters(ds, 'typescript');
      for (const t of ALL_TYPES) {
        expect(map.has(t), `${ds}: expected converter for '${t}'`).toBe(true);
      }
    });

    it(`${ds}: every converter declares fromDatasource=${ds}`, () => {
      const map = getDefaultConverters(ds, 'typescript');
      for (const [t, conv] of map) {
        expect(conv.fromDatasource, `${ds}.${t}.fromDatasource`).toBe(ds);
        expect(conv.toLanguage, `${ds}.${t}.toLanguage`).toBe('typescript');
        expect(conv.datasourceType, `${ds}.${t}.datasourceType`).toBe(t);
      }
    });

    it(`${ds}: identity-style types (string/number/integer/biginteger/smallinteger/float) pass values through`, () => {
      const map = getDefaultConverters(ds, 'typescript');
      const samples: Record<string, unknown> = {
        string: 'hello',
        number: 42,
        integer: 7,
        biginteger: 10_000_000_000,
        smallinteger: 3,
        float: 1.5,
      };
      for (const [t, v] of Object.entries(samples)) {
        const conv = map.get(t)!;
        expect(conv.to(v as never)).toBe(v);
        expect(conv.from(v as never)).toBe(v);
      }
    });
  }

  it('the converter map covers every converter type and treats reference as an identity extra (no dedicated converter)', () => {
    const map = getDefaultConverters('sqlite', 'typescript');
    for (const t of ALL_TYPES) expect(map.has(t), `converter for '${t}'`).toBe(true);
    expect(map.has('character'), "'character' resolves as an identity converter").toBe(true);
    expect(map.has('reference'), "'reference' has no dedicated converter").toBe(false);
  });
});
