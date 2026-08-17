import { columnValueMatches } from '../columnValueMatches';

describe('columnValueMatches', () => {
  describe('strict matches (identical types)', () => {
    it('matches identical numbers', () => {
      expect(columnValueMatches(5, 5)).toBe(true);
    });
    it('matches identical strings', () => {
      expect(columnValueMatches('a', 'a')).toBe(true);
    });
    it('matches identical booleans', () => {
      expect(columnValueMatches(true, true)).toBe(true);
    });
  });

  describe('string<->number cross-talk', () => {
    it('matches number row vs string query', () => {
      expect(columnValueMatches(5, '5')).toBe(true);
    });
    it('matches string row vs number query', () => {
      expect(columnValueMatches('5', 5)).toBe(true);
    });
    it('rejects different numbers regardless of representation', () => {
      expect(columnValueMatches(5, '6')).toBe(false);
      expect(columnValueMatches('5', 6)).toBe(false);
    });
  });

  describe('never crosses boolean/null/undefined boundaries', () => {
    it('false !== 0', () => {
      expect(columnValueMatches(false, 0)).toBe(false);
      expect(columnValueMatches(0, false)).toBe(false);
    });
    it('false !== "0"', () => {
      expect(columnValueMatches(false, '0')).toBe(false);
      expect(columnValueMatches('0', false)).toBe(false);
    });
    it('null !== undefined', () => {
      expect(columnValueMatches(null, undefined)).toBe(false);
      expect(columnValueMatches(undefined, null)).toBe(false);
    });
    it('null !== ""', () => {
      expect(columnValueMatches(null, '')).toBe(false);
      expect(columnValueMatches('', null)).toBe(false);
    });
    it('null !== 0', () => {
      expect(columnValueMatches(null, 0)).toBe(false);
      expect(columnValueMatches(0, null)).toBe(false);
    });
  });
});
