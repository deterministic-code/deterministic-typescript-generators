import { describe, it, expect } from 'vitest';
import {
  booleanFieldConverter,
  mysqlBooleanFieldConverter,
  postgresBooleanFieldConverter,
} from '../booleanFieldConverter';

const CASES = [
  {
    dialect: 'sqlite',
    conv: booleanFieldConverter,
    toLanguage: 'typescript',
    trueWire: 1,
    falseWire: 0,
    badFrom: [2],
  },
  {
    dialect: 'mysql',
    conv: mysqlBooleanFieldConverter,
    trueWire: 1,
    falseWire: 0,
    badFrom: [2, -1],
  },
  {
    dialect: 'postgres',
    conv: postgresBooleanFieldConverter,
    trueWire: true,
    falseWire: false,
    badFrom: [1],
  },
] as const;

describe.each(CASES)(
  'booleanFieldConverter ($dialect)',
  ({ dialect, conv, toLanguage, trueWire, falseWire, badFrom }) => {
    it(`declares fromDatasource ${dialect}, datasourceType boolean`, () => {
      expect(conv.fromDatasource).toBe(dialect);
      expect(conv.datasourceType).toBe('boolean');
      if (toLanguage) expect(conv.toLanguage).toBe(toLanguage);
    });

    it('to() maps true/false to the wire representation', () => {
      expect(conv.to(true)).toBe(trueWire);
      expect(conv.to(false)).toBe(falseWire);
    });

    it('from() maps the wire representation back to booleans', () => {
      expect(conv.from(trueWire)).toBe(true);
      expect(conv.from(falseWire)).toBe(false);
    });

    it('round-trips booleans', () => {
      for (const v of [true, false] as const) {
        expect(conv.from(conv.to(v))).toBe(v);
      }
    });

    it('passes null through in both directions', () => {
      expect(conv.to(null)).toBeNull();
      expect(conv.from(null)).toBeNull();
    });

    it('throws on non-boolean input to to()', () => {
      expect(() => conv.to('true' as unknown as boolean)).toThrow();
    });

    it('throws on out-of-domain input to from()', () => {
      for (const bad of badFrom) {
        expect(() => conv.from(bad as never)).toThrow();
      }
    });
  },
);
