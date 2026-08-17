import { describe, expect, it } from 'vitest';

import { buildBodySchema, type CrudRouteSpec } from '../parseCrudRouteSpecs';

const spec: CrudRouteSpec = {
  pathSegment: 'legacy-contacts',
  entityName: 'LegacyContact',
  primaryKeyColumn: 'key',
  primaryKeyIdType: 'string',
  columns: ['key', 'imported_at'],
  fields: [
    { name: 'key', type: 'string' },
    { name: 'imported_at', type: 'datetime', is_nullable: true },
  ],
};

describe('buildBodySchema — datetime request coercion', () => {
  it('coerces an ISO datetime string to a Date so the datasource write converter (which requires a Date) does not throw', () => {
    const parsed = buildBodySchema(spec, 'create').parse({
      key: 'k',
      imported_at: '2023-11-14T22:13:20.000Z',
    });
    expect(parsed.imported_at).toBeInstanceOf(Date);
    expect((parsed.imported_at as Date).toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('rejects an unparseable datetime string as a validation error (surfaces as 400, not a 500 at the converter)', () => {
    expect(() => buildBodySchema(spec, 'create').parse({ key: 'k', imported_at: 'nope' })).toThrow(
      /ISO-8601 datetime/,
    );
  });

  it('passes null through for a nullable datetime field', () => {
    const parsed = buildBodySchema(spec, 'create').parse({
      key: 'k',
      imported_at: null,
    });
    expect(parsed.imported_at).toBeNull();
  });
});
