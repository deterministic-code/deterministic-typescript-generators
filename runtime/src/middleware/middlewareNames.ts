export type MiddlewareTarget = 'app' | 'route' | 'service' | 'datasource';

export interface MiddlewareRegistryEntry {
  name: string;
  type: MiddlewareTarget;
  hidden?: boolean;
}

const ENTRIES: readonly MiddlewareRegistryEntry[] = [
  { name: 'cors', type: 'app' },
  { name: 'securityHeaders', type: 'app' },
  { name: 'jsonBody', type: 'app' },
  { name: 'largeJsonBody', type: 'app', hidden: true },
  { name: 'formBody', type: 'app' },
  { name: 'errorHandler', type: 'app' },
  { name: 'authenticate', type: 'route' },
  { name: 'authenticateSignin', type: 'route' },
  { name: 'authorize', type: 'route' },
  { name: 'validateBody', type: 'route' },
  { name: 'validateParams', type: 'route' },
  { name: 'protectBuiltinRow', type: 'route' },
  { name: 'traceRoute', type: 'route' },
  { name: 'traceService', type: 'service' },
  { name: 'traceDatasource', type: 'datasource' },
] as const;

export class BuiltinMiddleware {
  static all(): readonly MiddlewareRegistryEntry[] {
    return ENTRIES;
  }

  static publicEntries(): readonly MiddlewareRegistryEntry[] {
    return ENTRIES.filter((e) => !e.hidden);
  }

  static byTarget(target: MiddlewareTarget): readonly MiddlewareRegistryEntry[] {
    return ENTRIES.filter((e) => e.type === target);
  }

  static get(name: string): MiddlewareRegistryEntry | undefined {
    return ENTRIES.find((e) => e.name === name);
  }

  static has(name: string): boolean {
    return ENTRIES.some((e) => e.name === name);
  }

  static names(): readonly string[] {
    return ENTRIES.map((e) => e.name);
  }
}

export const MIDDLEWARE_REGISTRY: readonly MiddlewareRegistryEntry[] = ENTRIES;
