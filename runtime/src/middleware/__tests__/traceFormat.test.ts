import { describe, it, expect } from 'vitest';
import { formatElapsedMs, formatTraceLine } from '../traceFormat';

describe('formatTraceLine', () => {
  it('emits [ISO]-[tier][phase]-[method] with no suffix', () => {
    const line = formatTraceLine('2026-06-01T12:34:56.789Z', 'route', 'Start', 'GET /api/users/42');
    expect(line).toBe('[2026-06-01T12:34:56.789Z]-[route][Start]-[GET /api/users/42]');
  });

  it('appends suffix with a single leading space when provided', () => {
    const line = formatTraceLine(
      '2026-06-01T12:34:56.802Z',
      'route',
      'Finish',
      'GET /api/users/42',
      '200 13ms',
    );
    expect(line).toBe('[2026-06-01T12:34:56.802Z]-[route][Finish]-[GET /api/users/42] 200 13ms');
  });

  it('supports the datasource tier and Error phase', () => {
    const line = formatTraceLine(
      '2026-06-01T12:34:56.797Z',
      'datasource',
      'Error',
      'SELECT',
      'connection refused 2ms',
    );
    expect(line).toBe(
      '[2026-06-01T12:34:56.797Z]-[datasource][Error]-[SELECT] connection refused 2ms',
    );
  });

  it('supports the service tier', () => {
    const line = formatTraceLine(
      '2026-06-01T12:34:56.795Z',
      'service',
      'Start',
      'UsersService.findById',
    );
    expect(line).toBe('[2026-06-01T12:34:56.795Z]-[service][Start]-[UsersService.findById]');
  });

  it('omits suffix entirely when empty string passed', () => {
    const line = formatTraceLine('2026-06-01T00:00:00.000Z', 'service', 'Finish', 'X.y', '');
    expect(line).toBe('[2026-06-01T00:00:00.000Z]-[service][Finish]-[X.y]');
  });
});

describe('formatElapsedMs', () => {
  it('formats values >= 1ms as rounded milliseconds', () => {
    expect(formatElapsedMs(1)).toBe('1ms');
    expect(formatElapsedMs(42.5)).toBe('43ms');
    expect(formatElapsedMs(15.0)).toBe('15ms');
    expect(formatElapsedMs(1234.7)).toBe('1235ms');
  });

  it('formats sub-millisecond values as rounded microseconds', () => {
    expect(formatElapsedMs(0.234)).toBe('234μs');
    expect(formatElapsedMs(0.9999)).toBe('1000μs');
    expect(formatElapsedMs(0.001)).toBe('1μs');
    expect(formatElapsedMs(0.5)).toBe('500μs');
  });

  it('formats sub-microsecond values as rounded nanoseconds', () => {
    expect(formatElapsedMs(0.0009)).toBe('900ns');
    expect(formatElapsedMs(0.000123)).toBe('123ns');
    expect(formatElapsedMs(0.000001)).toBe('1ns');
  });

  it('formats exactly zero as 0ns', () => {
    expect(formatElapsedMs(0)).toBe('0ns');
  });

  it('clamps negative values (clock skew) to 0ns', () => {
    expect(formatElapsedMs(-0.5)).toBe('0ns');
  });
});
