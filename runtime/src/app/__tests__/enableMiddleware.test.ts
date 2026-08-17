import { describe, it, expect } from 'vitest';
import { applyEnableMiddleware, parseEnableMiddlewareEnv } from '../enableMiddleware';
import type { MiddlewareEntry } from '../loaders/parseBackendAppConfig';

describe('parseEnableMiddlewareEnv', () => {
  it('returns [] for undefined or empty input', () => {
    expect(parseEnableMiddlewareEnv(undefined)).toEqual([]);
    expect(parseEnableMiddlewareEnv('')).toEqual([]);
    expect(parseEnableMiddlewareEnv('   ')).toEqual([]);
  });

  it('translates tier shortcuts route/service/datasource to middleware names', () => {
    expect(parseEnableMiddlewareEnv('route,service,datasource')).toEqual([
      'traceRoute',
      'traceService',
      'traceDatasource',
    ]);
  });

  it('is case-insensitive for tier shortcuts', () => {
    expect(parseEnableMiddlewareEnv('Route, SERVICE')).toEqual(['traceRoute', 'traceService']);
  });

  it('passes through unknown tokens unchanged (custom middleware names)', () => {
    expect(parseEnableMiddlewareEnv('route,myCustom')).toEqual(['traceRoute', 'myCustom']);
  });

  it('drops empty segments', () => {
    expect(parseEnableMiddlewareEnv(',route,,service,')).toEqual(['traceRoute', 'traceService']);
  });
});

describe('applyEnableMiddleware', () => {
  function makeEntries(): MiddlewareEntry[] {
    return [
      { name: 'cors', type: 'app', enabled: true },
      { name: 'traceRoute', type: 'route', enabled: false },
      { name: 'traceService', type: 'service', enabled: false },
      { name: 'traceDatasource', type: 'datasource', enabled: false },
    ];
  }

  it('flips enabled: true on entries whose name is in the list', () => {
    const entries = makeEntries();
    applyEnableMiddleware(entries, ['traceRoute', 'traceDatasource']);
    expect(entries.find((e) => e.name === 'traceRoute')?.enabled).toBe(true);
    expect(entries.find((e) => e.name === 'traceDatasource')?.enabled).toBe(true);
    expect(entries.find((e) => e.name === 'traceService')?.enabled).toBe(false);
  });

  it('does not touch entries that are already enabled', () => {
    const entries = makeEntries();
    applyEnableMiddleware(entries, ['cors']);
    expect(entries.find((e) => e.name === 'cors')?.enabled).toBe(true);
  });

  it('is a no-op for empty list', () => {
    const entries = makeEntries();
    const before = JSON.parse(JSON.stringify(entries));
    applyEnableMiddleware(entries, []);
    expect(entries).toEqual(before);
  });

  it('silently ignores names not present in the entries list', () => {
    const entries = makeEntries();
    applyEnableMiddleware(entries, ['notAMiddleware']);
    expect(entries.find((e) => e.name === 'traceService')?.enabled).toBe(false);
  });

  it('injects known trace tier middlewares when backend-app.yaml omits them entirely', () => {
    const entries: MiddlewareEntry[] = [{ name: 'cors', type: 'app', enabled: true }];
    applyEnableMiddleware(entries, ['traceRoute', 'traceService', 'traceDatasource']);
    const route = entries.find((e) => e.name === 'traceRoute');
    const service = entries.find((e) => e.name === 'traceService');
    const datasource = entries.find((e) => e.name === 'traceDatasource');
    expect(route).toEqual({ name: 'traceRoute', type: 'route', enabled: true });
    expect(service).toEqual({ name: 'traceService', type: 'service', enabled: true });
    expect(datasource).toEqual({ name: 'traceDatasource', type: 'datasource', enabled: true });
  });

  it('still ignores unknown names that are not in the registry (no auto-injection)', () => {
    const entries: MiddlewareEntry[] = [{ name: 'cors', type: 'app', enabled: true }];
    applyEnableMiddleware(entries, ['unknownCustom']);
    expect(entries).toEqual([{ name: 'cors', type: 'app', enabled: true }]);
  });
});
