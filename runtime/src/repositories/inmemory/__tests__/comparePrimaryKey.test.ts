import { comparePrimaryKeyValues } from '../comparePrimaryKey';

describe('comparePrimaryKeyValues', () => {
  describe('numeric ids sort ascending', () => {
    it('orders a smaller id before a larger one', () => {
      expect(comparePrimaryKeyValues(1, 2)).toBeLessThan(0);
    });
    it('orders a larger id after a smaller one', () => {
      expect(comparePrimaryKeyValues(5, 2)).toBeGreaterThan(0);
    });
    it('treats equal ids as equal', () => {
      expect(comparePrimaryKeyValues(3, 3)).toBe(0);
    });
  });

  describe('bigint ids sort ascending', () => {
    it('orders a smaller bigint before a larger one', () => {
      expect(comparePrimaryKeyValues(1n, 9007199254740993n)).toBeLessThan(0);
    });
    it('orders a larger bigint after a smaller one', () => {
      expect(comparePrimaryKeyValues(9007199254740993n, 1n)).toBeGreaterThan(0);
    });
    it('treats equal bigints as equal', () => {
      expect(comparePrimaryKeyValues(42n, 42n)).toBe(0);
    });
  });

  describe('non-numeric ids keep insertion order (compare equal)', () => {
    it('returns 0 for two strings', () => {
      expect(comparePrimaryKeyValues('b', 'a')).toBe(0);
    });
    it('returns 0 for two uuids', () => {
      expect(
        comparePrimaryKeyValues(
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
        ),
      ).toBe(0);
    });
    it('returns 0 for a number compared against a bigint (mixed shape)', () => {
      expect(comparePrimaryKeyValues(1, 2n)).toBe(0);
    });
  });
});
