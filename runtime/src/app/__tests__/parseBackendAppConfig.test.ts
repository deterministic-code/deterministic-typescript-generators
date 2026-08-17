import { describe, expect, it } from 'vitest';
import { DEFAULT_HANDLERS, DEFAULT_MIDDLEWARE, parseBackendAppConfig } from '../loaders/parseBackendAppConfig';

describe('parseBackendAppConfig', () => {
  it('accepts a valid config with statics', () => {
    const cfg = parseBackendAppConfig({
      middleware: ['cors'],
      handlers: ['NotFoundMiddlewareService'],
      statics: [{ path: '/api/docs', dir: 'public/api-docs' }],
    });
    expect(cfg.handlers).toContainEqual({
      name: 'NotFoundMiddlewareService',
      enabled: true,
    });
    expect(cfg.statics).toEqual([{ path: '/api/docs', dir: 'public/api-docs' }]);
    expect(cfg.middleware.find((e) => e.name === 'cors')).toEqual({
      name: 'cors',
      type: 'app',
      enabled: true,
    });
  });

  it('accepts a valid config without statics', () => {
    const cfg = parseBackendAppConfig({
      middleware: ['cors'],
      handlers: ['NotFoundMiddlewareService'],
    });
    expect(cfg.statics).toBeUndefined();
  });

  it('rejects nested static entries (legacy skill shape)', () => {
    expect(() =>
      parseBackendAppConfig({
        middleware: ['cors'],
        handlers: ['x'],
        statics: [{ routes: { path: '/api/docs', dir: 'public/api-docs' } }],
      }),
    ).toThrow();
  });

  it('rejects a static entry missing dir', () => {
    expect(() =>
      parseBackendAppConfig({
        middleware: ['cors'],
        handlers: ['x'],
        statics: [{ path: '/api/docs' }],
      }),
    ).toThrow();
  });

  describe('middleware normalization', () => {
    it('normalizes a bare string entry to { name, type, enabled: true }', () => {
      const cfg = parseBackendAppConfig({
        middleware: ['cors'],
        handlers: ['x'],
      });
      const cors = cfg.middleware.find((e) => e.name === 'cors');
      expect(cors).toEqual({ name: 'cors', type: 'app', enabled: true });
    });

    it('normalizes a single-key map entry preserving options', () => {
      const cfg = parseBackendAppConfig({
        middleware: [
          { authenticateSignin: { apply_routes: ['/api/signin'] } },
          { authenticate: { deny_routes: ['/api/health'] } },
        ],
        handlers: ['x'],
      });
      expect(cfg.middleware).toContainEqual({
        name: 'authenticateSignin',
        type: 'app',
        enabled: true,
        apply_routes: ['/api/signin'],
      });
      expect(cfg.middleware).toContainEqual({
        name: 'authenticate',
        type: 'app',
        enabled: true,
        deny_routes: ['/api/health'],
      });
    });

    it('preserves enabled: false on a single-key map entry', () => {
      const cfg = parseBackendAppConfig({
        middleware: [{ cors: { enabled: false } }],
        handlers: ['x'],
      });
      const cors = cfg.middleware.find((e) => e.name === 'cors');
      expect(cors).toEqual({ name: 'cors', type: 'app', enabled: false });
    });

    it('rejects an item map with more than one key', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: [{ cors: { enabled: true }, securityHeaders: { enabled: true } }],
          handlers: ['x'],
        }),
      ).toThrow();
    });

    it('rejects apply_routes and deny_routes on the same item', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: [{ authenticate: { apply_routes: ['/api/x'], deny_routes: ['/api/y'] } }],
          handlers: ['x'],
        }),
      ).toThrow();
    });

    it('rejects duplicate middleware names', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: ['cors', { cors: { enabled: false } }],
          handlers: ['x'],
        }),
      ).toThrow(/duplicate.*cors/i);
    });

    it('rejects apply_routes entries that do not start with /', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: [{ authenticate: { apply_routes: ['api/x'] } }],
          handlers: ['x'],
        }),
      ).toThrow();
    });
  });

  describe('default middleware auto-prepend', () => {
    it('prepends all four defaults when middleware is omitted entirely', () => {
      const cfg = parseBackendAppConfig({ handlers: ['x'] });
      expect(cfg.middleware.map((e) => e.name)).toEqual([...DEFAULT_MIDDLEWARE]);
      for (const e of cfg.middleware) {
        expect(e.enabled).toBe(true);
      }
    });

    it('prepends all four defaults when middleware is an empty array', () => {
      const cfg = parseBackendAppConfig({ middleware: [], handlers: ['x'] });
      expect(cfg.middleware.map((e) => e.name)).toEqual([...DEFAULT_MIDDLEWARE]);
    });

    it('prepends only the defaults the user did not declare', () => {
      const cfg = parseBackendAppConfig({
        middleware: ['cors', 'authenticate'],
        handlers: ['x'],
      });
      // Missing defaults (securityHeaders, jsonBody, formBody) prepend in canonical order; user entries follow in declared order.
      expect(cfg.middleware.map((e) => e.name)).toEqual([
        'securityHeaders',
        'jsonBody',
        'formBody',
        'cors',
        'authenticate',
      ]);
    });

    it('does not duplicate a default the user declared with enabled: false', () => {
      const cfg = parseBackendAppConfig({
        middleware: [{ cors: { enabled: false } }],
        handlers: ['x'],
      });
      const corsEntries = cfg.middleware.filter((e) => e.name === 'cors');
      expect(corsEntries).toHaveLength(1);
      expect(corsEntries[0]).toEqual({ name: 'cors', type: 'app', enabled: false });
    });
  });

  describe('default handler auto-include', () => {
    it('exposes both built-in tail handlers as defaults', () => {
      expect([...DEFAULT_HANDLERS]).toEqual([
        'NotFoundMiddlewareService',
        'ErrorHandlerMiddlewareService',
      ]);
    });

    it('includes both defaults when handlers is omitted entirely', () => {
      const cfg = parseBackendAppConfig({ middleware: ['cors'] });
      expect(cfg.handlers).toEqual([
        { name: 'NotFoundMiddlewareService', enabled: true },
        { name: 'ErrorHandlerMiddlewareService', enabled: true },
      ]);
    });

    it('includes both defaults when handlers is an empty array', () => {
      const cfg = parseBackendAppConfig({ middleware: ['cors'], handlers: [] });
      expect(cfg.handlers.map((h) => h.name)).toEqual([
        'NotFoundMiddlewareService',
        'ErrorHandlerMiddlewareService',
      ]);
      for (const h of cfg.handlers) {
        expect(h.enabled).toBe(true);
      }
    });

    it('normalizes a bare string entry to { name, enabled: true }', () => {
      const cfg = parseBackendAppConfig({
        middleware: ['cors'],
        handlers: ['CustomTailHandlerService'],
      });
      const custom = cfg.handlers.find((h) => h.name === 'CustomTailHandlerService');
      expect(custom).toEqual({ name: 'CustomTailHandlerService', enabled: true });
    });

    it('object-form entry sets enabled: false (disables the default)', () => {
      const cfg = parseBackendAppConfig({
        middleware: ['cors'],
        handlers: [{ NotFoundMiddlewareService: { enabled: false } }],
      });
      const nf = cfg.handlers.find((h) => h.name === 'NotFoundMiddlewareService');
      expect(nf).toEqual({ name: 'NotFoundMiddlewareService', enabled: false });
      // The OTHER default still gets auto-included with enabled: true.
      const err = cfg.handlers.find((h) => h.name === 'ErrorHandlerMiddlewareService');
      expect(err).toEqual({ name: 'ErrorHandlerMiddlewareService', enabled: true });
    });

    it('does not duplicate a default the user declared', () => {
      const cfg = parseBackendAppConfig({
        middleware: ['cors'],
        handlers: ['ErrorHandlerMiddlewareService'],
      });
      const errEntries = cfg.handlers.filter((h) => h.name === 'ErrorHandlerMiddlewareService');
      expect(errEntries).toHaveLength(1);
    });

    it('rejects duplicate handler names', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: ['cors'],
          handlers: [
            'NotFoundMiddlewareService',
            { NotFoundMiddlewareService: { enabled: false } },
          ],
        }),
      ).toThrow(/duplicate.*NotFoundMiddlewareService/i);
    });

    it('rejects an item map with more than one key', () => {
      expect(() =>
        parseBackendAppConfig({
          middleware: ['cors'],
          handlers: [
            {
              NotFoundMiddlewareService: { enabled: false },
              ErrorHandlerMiddlewareService: { enabled: false },
            },
          ],
        }),
      ).toThrow();
    });
  });
});
