import { describe, it, expect } from 'vitest';
import { BuiltinMiddleware, MIDDLEWARE_REGISTRY } from '../middlewareNames';
import { BuiltinMiddleware as BarrelBuiltinMiddleware } from '../index';
import { MiddlewareLookup } from '../MiddlewareLookup';

const VALID_TYPES = new Set(['app', 'route', 'service', 'datasource']);

describe('MIDDLEWARE_REGISTRY', () => {
  it('lists each middleware exactly once with a valid type', () => {
    const seen = new Set<string>();
    for (const entry of MIDDLEWARE_REGISTRY) {
      expect(VALID_TYPES.has(entry.type)).toBe(true);
      expect(seen.has(entry.name)).toBe(false);
      seen.add(entry.name);
    }
    expect(seen.size).toBe(MIDDLEWARE_REGISTRY.length);
  });

  it('matches the agreed name -> type mapping', () => {
    const map = Object.fromEntries(MIDDLEWARE_REGISTRY.map((e) => [e.name, e.type]));
    expect(map).toEqual({
      cors: 'app',
      securityHeaders: 'app',
      jsonBody: 'app',
      largeJsonBody: 'app',
      formBody: 'app',
      errorHandler: 'app',
      authenticate: 'route',
      authenticateSignin: 'route',
      authorize: 'route',
      validateBody: 'route',
      validateParams: 'route',
      protectBuiltinRow: 'route',
      traceRoute: 'route',
      traceService: 'service',
      traceDatasource: 'datasource',
    });
  });

  it('every entry name is resolvable by MiddlewareLookup (with required deps)', () => {
    const mockAuthService = { authenticate: async () => null } as any;
    const mockAuthorizationService = { authorize: async () => null } as any;
    const lookup = new MiddlewareLookup({
      authService: mockAuthService,
      authorizationService: mockAuthorizationService,
      jwtSecret: 'test-secret',
    });
    const requiresArgNames = new Set(['validateBody', 'validateParams', 'protectBuiltinRow']);
    // traceService is wired via the service-wrap pass and traceDatasource via
    // buildDataSourceMiddlewares — neither is resolved through MiddlewareLookup.
    const notLookupResolved = new Set(['traceService', 'traceDatasource']);

    for (const entry of MIDDLEWARE_REGISTRY) {
      if (notLookupResolved.has(entry.name)) continue;
      if (requiresArgNames.has(entry.name)) {
        expect(() => lookup.get(entry.name as any)).toThrow();
      } else {
        expect(() => lookup.get(entry.name as any)).not.toThrow();
      }
    }
  });
});

describe('BuiltinMiddleware', () => {
  it('all() returns the 15 registry entries', () => {
    expect(BuiltinMiddleware.all()).toHaveLength(15);
  });

  it("byTarget('app') returns the 6 app-target entries", () => {
    const appEntries = BuiltinMiddleware.byTarget('app');
    expect(appEntries).toHaveLength(6);
    expect(appEntries.map((e) => e.name)).toEqual([
      'cors',
      'securityHeaders',
      'jsonBody',
      'largeJsonBody',
      'formBody',
      'errorHandler',
    ]);
  });

  it("byTarget('datasource') returns exactly the traceDatasource entry", () => {
    expect(BuiltinMiddleware.byTarget('datasource')).toEqual([
      { name: 'traceDatasource', type: 'datasource' },
    ]);
  });

  it("byTarget('service') returns exactly the traceService entry", () => {
    expect(BuiltinMiddleware.byTarget('service')).toEqual([
      { name: 'traceService', type: 'service' },
    ]);
  });

  it("get('cors') returns the cors entry and get('does-not-exist') returns undefined", () => {
    expect(BuiltinMiddleware.get('cors')).toEqual({ name: 'cors', type: 'app' });
    expect(BuiltinMiddleware.get('does-not-exist')).toBeUndefined();
  });

  it("has('cors') is true; has('does-not-exist') is false", () => {
    expect(BuiltinMiddleware.has('cors')).toBe(true);
    expect(BuiltinMiddleware.has('does-not-exist')).toBe(false);
  });

  it('names() returns all 15 entry names and includes cors and traceDatasource', () => {
    const names = BuiltinMiddleware.names();
    expect(names).toHaveLength(15);
    expect(names).toContain('cors');
    expect(names).toContain('traceDatasource');
  });

  it('is re-exported from the middleware barrel', () => {
    expect(BarrelBuiltinMiddleware).toBe(BuiltinMiddleware);
    expect(BarrelBuiltinMiddleware.all()).toHaveLength(15);
  });
});
