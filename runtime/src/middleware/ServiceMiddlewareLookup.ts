import type { IServiceMiddleware } from './IServiceMiddleware';
import type { MiddlewareDeps } from './MiddlewareLookup';
import { ServiceConsoleLoggerMiddleware } from './ServiceConsoleLoggerMiddleware';

export type ServiceMiddlewareFactory = (deps: MiddlewareDeps) => IServiceMiddleware;

export class ServiceMiddlewareLookup {
  constructor(
    private readonly deps: MiddlewareDeps = {},
    private readonly factories: Record<string, ServiceMiddlewareFactory> = {},
  ) {}

  get(name: string): IServiceMiddleware {
    switch (name) {
      case 'traceService':
        return new ServiceConsoleLoggerMiddleware();
      default: {
        const factory = this.factories[name];
        if (factory) return factory(this.deps);
        throw new Error(`Unknown service middleware: ${name}`);
      }
    }
  }
}
