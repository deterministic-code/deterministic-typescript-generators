import type { ArgSpec, ServiceConstructor, ServiceSpec } from './types';

export function lowerFirst(name: string): string {
  return name.length > 0 ? name[0].toLowerCase() + name.slice(1) : name;
}

export interface ResolveServicesInputs {
  specs: ServiceSpec[];
  classRegistry: Record<string, ServiceConstructor>;
  repos: Record<string, unknown>;
  config: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}

function topoSort(specs: ServiceSpec[]): ServiceSpec[] {
  const byName = new Map<string, ServiceSpec>();
  for (const s of specs) byName.set(s.name, s);

  const visited = new Map<string, 'visiting' | 'done'>();
  const order: ServiceSpec[] = [];

  const visit = (name: string, stack: string[]): void => {
    const state = visited.get(name);
    if (state === 'done') return;
    if (state === 'visiting') {
      throw new Error(
        `resolveServices: cyclic service dependency detected: ${[...stack, name].join(' -> ')}`,
      );
    }
    const spec = byName.get(name);
    if (!spec) return;
    visited.set(name, 'visiting');
    for (const arg of spec.args) {
      if (arg.kind === 'service') visit(arg.name, [...stack, name]);
    }
    visited.set(name, 'done');
    order.push(spec);
  };

  for (const s of specs) visit(s.name, []);
  return order;
}

export function resolveArg(
  serviceName: string,
  idx: number,
  arg: ArgSpec,
  ctx: {
    repos: Record<string, unknown>;
    config: Record<string, unknown>;
    built: Record<string, unknown>;
    overrides: Record<string, unknown>;
  },
): unknown {
  switch (arg.kind) {
    case 'undefined':
      return undefined;
    case 'literal':
      return arg.value;
    case 'repo': {
      if (!Object.prototype.hasOwnProperty.call(ctx.repos, arg.name)) {
        throw new Error(`resolveServices: ${serviceName} arg[${idx}]: unknown repo "${arg.name}"`);
      }
      return ctx.repos[arg.name];
    }
    case 'config': {
      if (!Object.prototype.hasOwnProperty.call(ctx.config, arg.key)) {
        throw new Error(
          `resolveServices: ${serviceName} arg[${idx}]: unknown config key "${arg.key}"`,
        );
      }
      return ctx.config[arg.key];
    }
    case 'service': {
      if (Object.prototype.hasOwnProperty.call(ctx.overrides, arg.name)) {
        return ctx.overrides[arg.name];
      }
      const outKey = lowerFirst(arg.name);
      if (!Object.prototype.hasOwnProperty.call(ctx.built, outKey)) {
        throw new Error(
          `resolveServices: ${serviceName} arg[${idx}]: unknown service "${arg.name}" (not in specs)`,
        );
      }
      return ctx.built[outKey];
    }
  }
}

export function resolveServices(inputs: ResolveServicesInputs): Record<string, unknown> {
  const { specs, classRegistry, repos, config, overrides = {} } = inputs;
  const ordered = topoSort(specs);
  const built: Record<string, unknown> = {};

  for (const spec of ordered) {
    const outKey = lowerFirst(spec.name);

    if (Object.prototype.hasOwnProperty.call(overrides, spec.name)) {
      built[outKey] = overrides[spec.name];
      continue;
    }

    const Ctor = classRegistry[spec.name];
    if (!Ctor) {
      throw new Error(
        `resolveServices: service "${spec.name}" has no class registered (missing from classRegistry)`,
      );
    }

    const args = spec.args.map((arg, idx) =>
      resolveArg(spec.name, idx, arg, { repos, config, built, overrides }),
    );

    built[outKey] = new Ctor(...args);
  }

  return built;
}

// Classes that declare `static readonly dependencies: ArgSpec[]` own their
// constructor args; the YAML spec is overridden so callers don't have to
// keep two copies in sync.
export function applyClassStaticDependencies(
  specs: ServiceSpec[],
  classRegistry: Record<string, ServiceConstructor>,
): ServiceSpec[] {
  const byName = new Map<string, ServiceSpec>();
  for (const spec of specs) byName.set(spec.name, spec);
  for (const [name, Ctor] of Object.entries(classRegistry)) {
    const deps = (Ctor as unknown as { dependencies?: ArgSpec[] }).dependencies;
    if (Array.isArray(deps)) byName.set(name, { name, args: [...deps] });
  }
  return Array.from(byName.values());
}
