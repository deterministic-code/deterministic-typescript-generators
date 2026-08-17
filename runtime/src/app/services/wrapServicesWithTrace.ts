import type { IServiceMiddleware } from '../../middleware/IServiceMiddleware';

/**
 * Returns the names of public methods declared on `target`'s prototype chain
 * (excluding Object.prototype) — used as the default allow-list when a caller
 * wants every public method of a service traced.
 *
 * Skips `constructor`, names starting with `_`, and non-function values.
 */
export function discoverServiceMethods(target: object): string[] {
  const names = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(target);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name.startsWith('_')) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (descriptor && typeof descriptor.value === 'function') {
        names.add(name);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names];
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null && typeof v === 'object' && typeof (v as { then?: unknown }).then === 'function'
  );
}

function runBefore(
  middlewares: ReadonlyArray<IServiceMiddleware>,
  serviceName: string,
  methodName: string,
  args: ReadonlyArray<unknown>,
): void {
  for (const m of middlewares) {
    try {
      m.beforeCall(serviceName, methodName, args);
    } catch (err) {
      console.warn(`trace beforeCall failed for ${serviceName}.${methodName}; continuing`, err);
    }
  }
}

function runAfter(
  middlewares: ReadonlyArray<IServiceMiddleware>,
  serviceName: string,
  methodName: string,
  args: ReadonlyArray<unknown>,
  result: unknown,
  elapsedMs: number,
  error?: unknown,
): void {
  for (const m of middlewares) {
    try {
      m.afterCall(serviceName, methodName, args, result, elapsedMs, error);
    } catch (err) {
      console.warn(`trace afterCall failed for ${serviceName}.${methodName}; continuing`, err);
    }
  }
}

/**
 * Returns a Proxy around `target` that emits trace hooks around method calls
 * whose key is in `allowKeys`. Methods are bound to `target`, so internal
 * `this.foo()` calls bypass the proxy and emit at most one Start/Finish pair
 * for the outer call.
 *
 * Pass an empty `middlewares` list to short-circuit and return `target`
 * itself — useful for the off-by-default path so production runs pay zero
 * proxy cost.
 */
export function wrapServicesWithTrace<T extends object>(
  target: T,
  serviceName: string,
  middlewares: ReadonlyArray<IServiceMiddleware>,
  allowKeys: ReadonlyArray<string>,
): T {
  if (middlewares.length === 0) return target;
  const allow = new Set(allowKeys);

  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof prop !== 'string' || !allow.has(prop) || typeof value !== 'function') {
        return value;
      }
      return function tracedMethod(this: unknown, ...args: unknown[]) {
        const start = performance.now();
        runBefore(middlewares, serviceName, prop, args);
        let result: unknown;
        try {
          result = (value as (...a: unknown[]) => unknown).apply(obj, args);
        } catch (err) {
          runAfter(middlewares, serviceName, prop, args, undefined, performance.now() - start, err);
          throw err;
        }
        if (isThenable(result)) {
          return (result as Promise<unknown>).then(
            (resolved) => {
              runAfter(middlewares, serviceName, prop, args, resolved, performance.now() - start);
              return resolved;
            },
            (err) => {
              runAfter(
                middlewares,
                serviceName,
                prop,
                args,
                undefined,
                performance.now() - start,
                err,
              );
              throw err;
            },
          );
        }
        runAfter(middlewares, serviceName, prop, args, result, performance.now() - start);
        return result;
      };
    },
  });
}
