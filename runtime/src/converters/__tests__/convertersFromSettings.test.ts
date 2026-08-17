import { describe, it, expect } from 'vitest';
import { convertersFromSettings, getDefaultConverters } from '../registry';
import type { SupportedDatasource } from '../ITypeFieldConverter';

const DIALECTS: SupportedDatasource[] = ['sqlite', 'mysql', 'postgres'];
const ISO = '2026-05-04T12:34:56.789Z';
const RFC = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NON_ISO = 'plain-string';
const NON_RFC = 'not-a-uuid';

const NON_REPR_TYPES = [
  'string',
  'number',
  'integer',
  'biginteger',
  'smallinteger',
  'float',
  'boolean',
  'binary',
];
const ALL_TYPES = [...NON_REPR_TYPES, 'datetime', 'uuid'];

describe.each(DIALECTS)('convertersFromSettings %s', (dialect) => {
  it("datetime:'string' registers the passthrough converter (non-ISO string round-trips unchanged)", () => {
    const dt = convertersFromSettings({ datasource: { datetime: 'string' } }, dialect).get(
      'datetime',
    )!;
    expect(dt.datasourceType).toBe('datetime');
    expect(dt.to(NON_ISO)).toBe(NON_ISO);
    expect(dt.from(NON_ISO)).toBe(NON_ISO);
  });

  it("datetime:'native' registers the same Date converter as getDefaultConverters (from(iso)->Date)", () => {
    const dt = convertersFromSettings({ datasource: { datetime: 'native' } }, dialect).get(
      'datetime',
    )!;
    const nativeDefault = getDefaultConverters(dialect, 'typescript').get('datetime')!;
    expect(dt).toBe(nativeDefault);
    expect((dt.from(ISO) as Date).toISOString()).toBe(ISO);
    expect(() => dt.to(NON_ISO as never)).toThrow(/expected Date/i);
  });

  it("uuid:'string' registers the passthrough (non-RFC string passes) and 'native' validates (throws on non-RFC)", () => {
    const stringUuid = convertersFromSettings({ datasource: { uuid: 'string' } }, dialect).get(
      'uuid',
    )!;
    expect(stringUuid.datasourceType).toBe('uuid');
    expect(stringUuid.to(NON_RFC)).toBe(NON_RFC);
    expect(stringUuid.from(NON_RFC)).toBe(NON_RFC);

    const nativeUuid = convertersFromSettings({ datasource: { uuid: 'native' } }, dialect).get(
      'uuid',
    )!;
    expect(nativeUuid.to(RFC)).toBe(RFC);
    expect(() => nativeUuid.to(NON_RFC)).toThrow(/RFC-4122/i);
    expect(() => nativeUuid.from(NON_RFC)).toThrow(/RFC-4122/i);
  });

  it.each([
    { label: '{}', settings: {} },
    { label: '{ datasource: {} }', settings: { datasource: {} } },
  ])('absent reprs ($label) resolve datetime + uuid to the native converters', ({ settings }) => {
    const map = convertersFromSettings(settings, dialect);
    const defaults = getDefaultConverters(dialect, 'typescript');
    expect(map.get('datetime')).toBe(defaults.get('datetime'));
    expect(map.get('uuid')).toBe(defaults.get('uuid'));
  });

  it('registers every expected type key regardless of repr', () => {
    const map = convertersFromSettings(
      { datasource: { datetime: 'string', uuid: 'string' } },
      dialect,
    );
    for (const t of ALL_TYPES) {
      expect(map.has(t), `${dialect}: expected converter for '${t}'`).toBe(true);
    }
  });

  it('non-repr types behave identically to getDefaultConverters (round-trip a sample)', () => {
    const map = convertersFromSettings(
      { datasource: { datetime: 'string', uuid: 'string' } },
      dialect,
    );
    const defaults = getDefaultConverters(dialect, 'typescript');
    const samples: Record<string, unknown> = {
      string: 'hello',
      number: 42,
      integer: 7,
      biginteger: 10_000_000_000,
      smallinteger: 3,
      float: 1.5,
      boolean: true,
      binary: 'AQID',
    };
    for (const t of NON_REPR_TYPES) {
      const got = map.get(t)!;
      const want = defaults.get(t)!;
      expect(got.fromDatasource, `${dialect}.${t}.fromDatasource`).toBe(want.fromDatasource);
      expect(got.datasourceType, `${dialect}.${t}.datasourceType`).toBe(want.datasourceType);
      const v = samples[t] as never;
      expect(got.to(v), `${dialect}.${t}.to`).toStrictEqual(want.to(v));
      expect(got.from(want.to(v) as never), `${dialect}.${t}.from`).toStrictEqual(
        want.from(want.to(v) as never),
      );
    }
  });
});

describe('convertersFromSettings parity with getDefaultConverters when reprs absent', () => {
  for (const dialect of DIALECTS) {
    it(`${dialect}: convertersFromSettings({}, d) matches getDefaultConverters(d,'typescript') type-key-for-type-key`, () => {
      const map = convertersFromSettings({}, dialect);
      const defaults = getDefaultConverters(dialect, 'typescript');
      expect([...map.keys()].sort()).toEqual([...defaults.keys()].sort());
      for (const [t, conv] of defaults) {
        const got = map.get(t)!;
        expect(got.datasourceType, `${dialect}.${t}.datasourceType`).toBe(conv.datasourceType);
        expect(got.fromDatasource, `${dialect}.${t}.fromDatasource`).toBe(conv.fromDatasource);
        expect(got.toLanguage, `${dialect}.${t}.toLanguage`).toBe(conv.toLanguage);
      }
    });
  }
});
