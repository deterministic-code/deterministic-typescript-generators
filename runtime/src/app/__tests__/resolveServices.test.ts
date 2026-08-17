import { describe, expect, it } from 'vitest';
import { applyClassStaticDependencies, resolveServices } from '../services/resolveServices';
import type { ArgSpec, ServiceConstructor } from '../services/types';

class Echo {
  constructor(public args: unknown[]) {}
}

const Echoing: ServiceConstructor = function (this: Echo, ...args: unknown[]) {
  this.args = args;
} as unknown as ServiceConstructor;
Object.setPrototypeOf(Echoing.prototype, Echo.prototype);

describe('resolveServices', () => {
  it('resolves repo, config, literal, undefined, and service args in topological order', () => {
    const result = resolveServices({
      specs: [
        {
          name: 'B',
          args: [
            { kind: 'service', name: 'A' },
            { kind: 'config', key: 'secret' },
            { kind: 'literal', value: 7 },
            { kind: 'undefined' },
          ],
        },
        { name: 'A', args: [{ kind: 'repo', name: 'userRepo' }] },
      ],
      classRegistry: { A: Echoing, B: Echoing },
      repos: { userRepo: { tag: 'user' } },
      config: { secret: 'shh' },
    });

    const a = result.a as Echo;
    const b = result.b as Echo;
    expect(a.args).toEqual([{ tag: 'user' }]);
    expect(b.args).toEqual([a, 'shh', 7, undefined]);
  });

  it('uses overrides for a service, skipping the constructor', () => {
    const stub = { tag: 'stub' };
    const result = resolveServices({
      specs: [{ name: 'A', args: [{ kind: 'literal', value: 1 }] }],
      classRegistry: { A: Echoing },
      repos: {},
      config: {},
      overrides: { A: stub },
    });
    expect(result.a).toBe(stub);
  });

  it('throws on a missing class registration', () => {
    expect(() =>
      resolveServices({
        specs: [{ name: 'A', args: [] }],
        classRegistry: {},
        repos: {},
        config: {},
      }),
    ).toThrow(/no class registered/);
  });

  it('throws on an unknown repo arg', () => {
    expect(() =>
      resolveServices({
        specs: [{ name: 'A', args: [{ kind: 'repo', name: 'missing' }] }],
        classRegistry: { A: Echoing },
        repos: {},
        config: {},
      }),
    ).toThrow(/unknown repo/);
  });

  it('throws on an unknown config key', () => {
    expect(() =>
      resolveServices({
        specs: [{ name: 'A', args: [{ kind: 'config', key: 'missing' }] }],
        classRegistry: { A: Echoing },
        repos: {},
        config: {},
      }),
    ).toThrow(/unknown config key/);
  });

  it('throws on an unknown service arg', () => {
    expect(() =>
      resolveServices({
        specs: [{ name: 'A', args: [{ kind: 'service', name: 'B' }] }],
        classRegistry: { A: Echoing },
        repos: {},
        config: {},
      }),
    ).toThrow(/unknown service/);
  });

  it('detects cyclic dependencies', () => {
    expect(() =>
      resolveServices({
        specs: [
          { name: 'A', args: [{ kind: 'service', name: 'B' }] },
          { name: 'B', args: [{ kind: 'service', name: 'A' }] },
        ],
        classRegistry: { A: Echoing, B: Echoing },
        repos: {},
        config: {},
      }),
    ).toThrow(/cyclic/);
  });
});

describe('applyClassStaticDependencies', () => {
  it('overrides YAML args when class declares static dependencies', () => {
    const deps: ArgSpec[] = [{ kind: 'literal', value: 9 }];
    const Cls: ServiceConstructor & { dependencies?: ArgSpec[] } = function () {
      // empty
    } as unknown as ServiceConstructor;
    Cls.dependencies = deps;

    const merged = applyClassStaticDependencies(
      [{ name: 'Cls', args: [{ kind: 'literal', value: 1 }] }],
      { Cls },
    );
    expect(merged[0].args).toEqual(deps);
  });

  it('inserts class with no YAML entry when it declares static dependencies', () => {
    const Cls: ServiceConstructor & { dependencies?: ArgSpec[] } = function () {
      // empty
    } as unknown as ServiceConstructor;
    Cls.dependencies = [];
    const merged = applyClassStaticDependencies([], { Cls });
    expect(merged).toEqual([{ name: 'Cls', args: [] }]);
  });

  it('leaves YAML specs unchanged when class has no static dependencies', () => {
    const Cls: ServiceConstructor = function () {
      // empty
    } as unknown as ServiceConstructor;
    const merged = applyClassStaticDependencies(
      [{ name: 'Cls', args: [{ kind: 'literal', value: 1 }] }],
      { Cls },
    );
    expect(merged[0].args).toEqual([{ kind: 'literal', value: 1 }]);
  });
});
