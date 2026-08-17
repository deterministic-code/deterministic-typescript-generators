import { DataSourceConsoleLoggerMiddleware } from './DataSourceConsoleLoggerMiddleware';
import type { IDataSourceMiddleware } from './IDataSourceMiddleware';
import type { MiddlewareDeps } from './MiddlewareLookup';

export type DataSourceMiddlewareFactory = (deps: MiddlewareDeps) => IDataSourceMiddleware;

export class DataSourceMiddlewareLookup {
  constructor(
    private readonly deps: MiddlewareDeps = {},
    private readonly factories: Record<string, DataSourceMiddlewareFactory> = {},
  ) {}

  get(name: string): IDataSourceMiddleware {
    switch (name) {
      case 'dataSourceConsoleLogger':
      case 'traceDatasource':
        return new DataSourceConsoleLoggerMiddleware();
      default: {
        const factory = this.factories[name];
        if (factory) return factory(this.deps);
        throw new Error(`Unknown datasource middleware: ${name}`);
      }
    }
  }
}
