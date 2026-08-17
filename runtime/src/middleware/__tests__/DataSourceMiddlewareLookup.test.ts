import { DataSourceConsoleLoggerMiddleware } from '../DataSourceConsoleLoggerMiddleware';
import {
  DataSourceMiddlewareLookup,
  type DataSourceMiddlewareFactory,
} from '../DataSourceMiddlewareLookup';
import type { IDataSourceMiddleware } from '../IDataSourceMiddleware';

describe('DataSourceMiddlewareLookup', () => {
  test("built-in 'traceDatasource' resolves and beforeQuery prints [datasource][Start]-[SELECT 1]", () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const lookup = new DataSourceMiddlewareLookup();
      const mw = lookup.get('traceDatasource');
      expect(mw).toBeInstanceOf(DataSourceConsoleLoggerMiddleware);

      mw.beforeQuery('sqlite', 'SELECT 1');

      const lines = logSpy.mock.calls.map((args) => String(args[0]));
      expect(lines.some((l) => /\[datasource\]\[Start\]-\[SELECT 1\]/.test(l))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("'dataSourceConsoleLogger' is an alias for the same built-in impl", () => {
    const lookup = new DataSourceMiddlewareLookup();
    expect(lookup.get('dataSourceConsoleLogger')).toBeInstanceOf(DataSourceConsoleLoggerMiddleware);
    expect(lookup.get('traceDatasource')).toBeInstanceOf(DataSourceConsoleLoggerMiddleware);
  });

  test('factory contributes a fresh name; deps are passed through unchanged', () => {
    const impl: IDataSourceMiddleware = {
      beforeQuery: vi.fn(),
      afterQuery: vi.fn(),
    };
    const factory: DataSourceMiddlewareFactory = vi.fn(() => impl);
    const deps = { jwtSecret: 'shh' };
    const lookup = new DataSourceMiddlewareLookup(deps, { myQueryAudit: factory });

    expect(lookup.get('myQueryAudit')).toBe(impl);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(deps);
  });

  test("built-in 'traceDatasource' wins over a factory with the same key", () => {
    const factory = vi.fn();
    const lookup = new DataSourceMiddlewareLookup(
      {},
      { traceDatasource: factory as unknown as DataSourceMiddlewareFactory },
    );
    expect(lookup.get('traceDatasource')).toBeInstanceOf(DataSourceConsoleLoggerMiddleware);
    expect(factory).not.toHaveBeenCalled();
  });

  test('unknown name with no factory throws Unknown datasource middleware: <name>', () => {
    const lookup = new DataSourceMiddlewareLookup();
    expect(() => lookup.get('nope')).toThrow(/Unknown datasource middleware: nope/);
  });
});
