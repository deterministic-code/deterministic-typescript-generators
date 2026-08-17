import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverServiceMethods, wrapServicesWithTrace } from '../wrapServicesWithTrace';
import { ServiceConsoleLoggerMiddleware } from '../../../middleware/ServiceConsoleLoggerMiddleware';
import type { IServiceMiddleware } from '../../../middleware/IServiceMiddleware';

const CRUD_KEYS = ['findById', 'findAll', 'create', 'update', 'remove'];

const TRACE = /^\[[^\]]+\]-\[service\]\[(Start|Finish|Error)\]-\[([^\]]+)\](?:\s+(.*))?$/;

interface Captured {
  phase: 'Start' | 'Finish' | 'Error';
  method: string;
  suffix?: string;
}

function capture(spy: ReturnType<typeof vi.spyOn>): Captured[] {
  return spy.mock.calls
    .map((args) => String(args[0]))
    .map((line) => TRACE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      phase: m[1] as Captured['phase'],
      method: m[2],
      suffix: m[3],
    }));
}

describe('wrapServicesWithTrace', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let mw: IServiceMiddleware[];

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mw = [new ServiceConsoleLoggerMiddleware()];
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits exactly one Start + Finish per outer method call (async)', async () => {
    class Svc {
      async findById(id: number) {
        return { id };
      }
    }
    const wrapped = wrapServicesWithTrace(new Svc(), 'Svc', mw, CRUD_KEYS);

    const result = await wrapped.findById(42);
    expect(result).toEqual({ id: 42 });

    const traced = capture(logSpy);
    expect(traced).toHaveLength(2);
    expect(traced[0]).toMatchObject({ phase: 'Start', method: 'Svc.findById' });
    expect(traced[1]).toMatchObject({ phase: 'Finish', method: 'Svc.findById' });
  });

  it('does NOT double-log when an outer method internally calls another wrapped method', async () => {
    class Svc {
      async findById(id: number) {
        return { id };
      }
      async findAll() {
        // internal call — must NOT go through the proxy.
        const a = await this.findById(1);
        const b = await this.findById(2);
        return [a, b];
      }
    }
    const wrapped = wrapServicesWithTrace(new Svc(), 'Svc', mw, CRUD_KEYS);

    const result = await wrapped.findAll();
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);

    const traced = capture(logSpy);
    const methods = traced.map((t) => `${t.phase} ${t.method}`);
    expect(methods).toEqual(['Start Svc.findAll', 'Finish Svc.findAll']);
  });

  it('keeps synchronous return values synchronous', () => {
    class Svc {
      findById(id: number) {
        return { id };
      }
    }
    const wrapped = wrapServicesWithTrace(new Svc(), 'Svc', mw, CRUD_KEYS);

    const result = wrapped.findById(7);
    expect(result).toEqual({ id: 7 });
    expect(typeof (result as { then?: unknown }).then).toBe('undefined');

    const traced = capture(logSpy);
    expect(traced.map((t) => t.phase)).toEqual(['Start', 'Finish']);
  });

  it('emits an Error line on a rejected promise', async () => {
    class Svc {
      async findById(_id: number): Promise<never> {
        throw new Error('not found');
      }
    }
    const wrapped = wrapServicesWithTrace(new Svc(), 'Svc', mw, CRUD_KEYS);

    await expect(wrapped.findById(42)).rejects.toThrow('not found');

    const traced = capture(logSpy);
    expect(traced.map((t) => t.phase)).toEqual(['Start', 'Error']);
    expect(traced[1].suffix).toMatch(/not found.*\d+(?:ms|μs)/);
  });

  it('does not wrap methods absent from allowKeys', () => {
    class Svc {
      findById(id: number) {
        return { id };
      }
      internalHelper(x: number) {
        return x * 2;
      }
    }
    const wrapped = wrapServicesWithTrace(new Svc(), 'Svc', mw, ['findById']);

    wrapped.internalHelper(5);
    expect(capture(logSpy)).toEqual([]);

    wrapped.findById(1);
    expect(capture(logSpy).map((t) => t.phase)).toEqual(['Start', 'Finish']);
  });

  it('does not wrap non-function properties', () => {
    const target = { name: 'x', findById: (id: number) => ({ id }) };
    const wrapped = wrapServicesWithTrace(target, 'Svc', mw, ['findById', 'name']);

    expect(wrapped.name).toBe('x');
    expect(capture(logSpy)).toEqual([]);
  });

  it('is a no-op when middlewares list is empty', async () => {
    class Svc {
      async findById(id: number) {
        return { id };
      }
    }
    const original = new Svc();
    const wrapped = wrapServicesWithTrace(original, 'Svc', [], CRUD_KEYS);
    expect(wrapped).toBe(original);
  });
});

describe('discoverServiceMethods', () => {
  it('returns own-prototype method names, excluding constructor and underscored helpers', () => {
    class Svc {
      findById(id: number) {
        return { id };
      }
      findAll() {
        return [];
      }
      _privateHelper() {
        return null;
      }
    }
    const methods = discoverServiceMethods(new Svc());
    expect(new Set(methods)).toEqual(new Set(['findById', 'findAll']));
  });

  it('walks up the prototype chain (subclass inherits base methods)', () => {
    class Base {
      a() {
        return 1;
      }
    }
    class Sub extends Base {
      b() {
        return 2;
      }
    }
    const methods = discoverServiceMethods(new Sub());
    expect(new Set(methods)).toEqual(new Set(['a', 'b']));
  });

  it('ignores non-function properties (including getters)', () => {
    class Svc {
      get name() {
        return 'x';
      }
      findById() {
        return null;
      }
    }
    const methods = discoverServiceMethods(new Svc());
    expect(methods).toEqual(['findById']);
  });
});
