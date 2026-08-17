import { describe, expect, it } from 'vitest';

import { parseServiceSpecs } from '../parseServiceSpecs';

describe('parseServiceSpecs', () => {
  it('includes entries declared with no args (default to empty args)', () => {
    const doc = {
      services: [
        {
          name: 'HealthCheckService',
          type: 'services/HealthCheckService',
          description: 'Liveness probe.',
        },
      ],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([
      {
        name: 'HealthCheckService',
        args: [],
        type: 'services/HealthCheckService',
      },
    ]);
  });

  it('includes entries declared with an explicit empty args array', () => {
    const doc = {
      services: [{ name: 'NoArgService', args: [] }],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([{ name: 'NoArgService', args: [] }]);
  });

  it('preserves entries with explicit args', () => {
    const doc = {
      services: [
        {
          name: 'WithDep',
          args: [{ kind: 'repo', name: 'userRepo' }],
        },
      ],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([{ name: 'WithDep', args: [{ kind: 'repo', name: 'userRepo' }] }]);
  });

  it('preserves the type: field so callers can detect built-in services', () => {
    const doc = {
      services: [
        {
          name: 'HealthCheckService',
          type: 'services/HealthCheckService',
          description: 'Liveness probe.',
        },
      ],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([
      {
        name: 'HealthCheckService',
        args: [],
        type: 'services/HealthCheckService',
      },
    ]);
  });

  it('omits type when the entry has none', () => {
    const doc = { services: [{ name: 'X' }] };
    const specs = parseServiceSpecs(doc);
    expect(specs[0]).not.toHaveProperty('type');
  });

  it('preserves the module: field so the runtime can dynamic-import the class', () => {
    const doc = {
      services: [
        {
          name: 'HealthCheckService',
          module: './services/custom/health-check-service',
        },
      ],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([
      {
        name: 'HealthCheckService',
        args: [],
        module: './services/custom/health-check-service',
      },
    ]);
  });

  it('omits module when the entry has none', () => {
    const doc = { services: [{ name: 'Y' }] };
    const specs = parseServiceSpecs(doc);
    expect(specs[0]).not.toHaveProperty('module');
  });

  it('returns mixed argful and argless entries together', () => {
    const doc = {
      services: [
        { name: 'HealthCheckService', type: 'services/HealthCheckService' },
        { name: 'WithDep', args: [{ kind: 'config', key: 'apiKey' }] },
      ],
    };
    const specs = parseServiceSpecs(doc);
    expect(specs).toEqual([
      {
        name: 'HealthCheckService',
        args: [],
        type: 'services/HealthCheckService',
      },
      { name: 'WithDep', args: [{ kind: 'config', key: 'apiKey' }] },
    ]);
  });
});
