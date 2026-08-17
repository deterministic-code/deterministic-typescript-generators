import { describe, it, expect } from 'vitest';
import { effectiveTableName } from '../effectiveTableName';

describe('effectiveTableName', () => {
  it('returns the name unchanged when pluralizeFlag is false', () => {
    expect(effectiveTableName('backend', false)).toBe('backend');
    expect(effectiveTableName('backend_type', false)).toBe('backend_type');
  });

  it('pluralizes a single-token name when flag is true', () => {
    expect(effectiveTableName('backend', true)).toBe('backends');
    expect(effectiveTableName('task', true)).toBe('tasks');
    expect(effectiveTableName('user', true)).toBe('users');
  });

  it('pluralizes the last token only for multi-token names', () => {
    expect(effectiveTableName('backend_type', true)).toBe('backend_types');
    expect(effectiveTableName('task_step', true)).toBe('task_steps');
    expect(effectiveTableName('local_setting', true)).toBe('local_settings');
  });

  it('handles -y endings correctly', () => {
    expect(effectiveTableName('candy', true)).toBe('candies');
    expect(effectiveTableName('category', true)).toBe('categories');
    expect(effectiveTableName('key', true)).toBe('keys'); // vowel + y
  });

  it('handles classical irregulars', () => {
    expect(effectiveTableName('man', true)).toBe('men');
    expect(effectiveTableName('child', true)).toBe('children');
    expect(effectiveTableName('mouse', true)).toBe('mice');
    expect(effectiveTableName('person', true)).toBe('people');
  });

  it('leaves already-plural words alone', () => {
    expect(effectiveTableName('analytics', true)).toBe('analytics');
    expect(effectiveTableName('news', true)).toBe('news');
    expect(effectiveTableName('series', true)).toBe('series');
  });

  it('handles -f / -fe -> -ves', () => {
    expect(effectiveTableName('leaf', true)).toBe('leaves');
    expect(effectiveTableName('knife', true)).toBe('knives');
  });

  it('returns empty input unchanged', () => {
    expect(effectiveTableName('', true)).toBe('');
  });
});
