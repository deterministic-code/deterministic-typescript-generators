import type { IServiceMiddleware } from '../IServiceMiddleware';
import { ServiceConsoleLoggerMiddleware } from '../ServiceConsoleLoggerMiddleware';
import { ServiceMiddlewareLookup, type ServiceMiddlewareFactory } from '../ServiceMiddlewareLookup';

describe('ServiceMiddlewareLookup', () => {
  test("built-in 'traceService' resolves to an IServiceMiddleware that prints [service][Start]/[Finish]", () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const lookup = new ServiceMiddlewareLookup();
      const mw = lookup.get('traceService');
      expect(mw).toBeInstanceOf(ServiceConsoleLoggerMiddleware);

      mw.beforeCall('Foo', 'bar', []);
      mw.afterCall('Foo', 'bar', [], undefined, 1);

      const lines = logSpy.mock.calls.map((args) => String(args[0]));
      expect(lines.some((l) => /\[service\]\[Start\]-\[Foo\.bar\]/.test(l))).toBe(true);
      expect(lines.some((l) => /\[service\]\[Finish\]-\[Foo\.bar\]/.test(l))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test('factory contributes a fresh name; deps are passed through unchanged', () => {
    const impl: IServiceMiddleware = {
      beforeCall: vi.fn(),
      afterCall: vi.fn(),
    };
    const factory: ServiceMiddlewareFactory = vi.fn(() => impl);
    const deps = { jwtSecret: 'shh' };
    const lookup = new ServiceMiddlewareLookup(deps, { myAudit: factory });

    expect(lookup.get('myAudit')).toBe(impl);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(deps);
  });

  test("built-in 'traceService' wins over a factory with the same key", () => {
    const factory = vi.fn();
    const lookup = new ServiceMiddlewareLookup(
      {},
      { traceService: factory as unknown as ServiceMiddlewareFactory },
    );
    expect(lookup.get('traceService')).toBeInstanceOf(ServiceConsoleLoggerMiddleware);
    expect(factory).not.toHaveBeenCalled();
  });

  test('unknown name with no factory throws Unknown service middleware: <name>', () => {
    const lookup = new ServiceMiddlewareLookup();
    expect(() => lookup.get('nope')).toThrow(/Unknown service middleware: nope/);
  });
});
