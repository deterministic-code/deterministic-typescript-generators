import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceConsoleLoggerMiddleware } from '../ServiceConsoleLoggerMiddleware';

describe('ServiceConsoleLoggerMiddleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('beforeCall emits a Start line in the unified format', () => {
    const mw = new ServiceConsoleLoggerMiddleware();
    mw.beforeCall('UsersService', 'findById', [42]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toMatch(/^\[[^\]]+\]-\[service\]\[Start\]-\[UsersService\.findById\]$/);
  });

  it('afterCall emits a Finish line with elapsed ms', () => {
    const mw = new ServiceConsoleLoggerMiddleware();
    mw.afterCall('UsersService', 'findById', [42], { id: 42 }, 3.14);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toMatch(/^\[[^\]]+\]-\[service\]\[Finish\]-\[UsersService\.findById\] 3ms$/);
  });

  it('afterCall with error emits an Error line including the error message and elapsed', () => {
    const mw = new ServiceConsoleLoggerMiddleware();
    mw.afterCall('UsersService', 'findById', [42], undefined, 7.9, new Error('boom'));

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toMatch(/^\[[^\]]+\]-\[service\]\[Error\]-\[UsersService\.findById\] boom 8ms$/);
  });

  it('formats sub-millisecond elapsed as microseconds', () => {
    const mw = new ServiceConsoleLoggerMiddleware();
    mw.afterCall('S', 'm', [], null, 0.4);
    expect((logSpy.mock.calls[0][0] as string).endsWith(' 400μs')).toBe(true);
  });
});
