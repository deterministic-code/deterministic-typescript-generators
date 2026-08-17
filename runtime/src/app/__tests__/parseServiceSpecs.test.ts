import { describe, expect, it } from 'vitest';
import { parseServiceSpecs } from '../loaders/parseServiceSpecs';

describe('parseServiceSpecs', () => {
  it('returns specs for every entry, defaulting missing/empty args to []', () => {
    const specs = parseServiceSpecs({
      services: [
        {
          name: 'SigninService',
          args: [
            { kind: 'repo', name: 'userService' },
            { kind: 'config', key: 'jwtSecret' },
          ],
        },
        { name: 'EmptyArgsService', args: [] },
        { name: 'NoArgsService' },
      ],
    });
    expect(specs).toEqual([
      {
        name: 'SigninService',
        args: [
          { kind: 'repo', name: 'userService' },
          { kind: 'config', key: 'jwtSecret' },
        ],
      },
      { name: 'EmptyArgsService', args: [] },
      { name: 'NoArgsService', args: [] },
    ]);
  });

  it('supports literal, undefined, and service arg kinds', () => {
    const specs = parseServiceSpecs({
      services: [
        {
          name: 'X',
          args: [
            { kind: 'literal', value: 42 },
            { kind: 'undefined' },
            { kind: 'service', name: 'Y' },
          ],
        },
      ],
    });
    expect(specs[0].args).toEqual([
      { kind: 'literal', value: 42 },
      { kind: 'undefined' },
      { kind: 'service', name: 'Y' },
    ]);
  });

  it('rejects an unknown arg kind', () => {
    expect(() =>
      parseServiceSpecs({
        services: [{ name: 'X', args: [{ kind: 'magic', name: 'y' }] }],
      }),
    ).toThrow();
  });

  it('rejects a service entry without a name', () => {
    expect(() => parseServiceSpecs({ services: [{ args: [{ kind: 'undefined' }] }] })).toThrow();
  });
});
