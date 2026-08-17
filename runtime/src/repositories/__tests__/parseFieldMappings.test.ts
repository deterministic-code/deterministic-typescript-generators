import { describe, it, expect } from 'vitest';
import { parseFieldMappings, parseAllMappings, getEntityFieldMap } from '../parseFieldMappings';

const parseFieldConverters = (data: unknown) => parseAllMappings(data).converters;

describe('parseFieldMappings', () => {
  it('returns an empty map when input is null', () => {
    expect(parseFieldMappings(null).size).toBe(0);
  });

  it('returns an empty map when input is undefined', () => {
    expect(parseFieldMappings(undefined).size).toBe(0);
  });

  it('returns an empty map when datasource_mappings is missing', () => {
    expect(parseFieldMappings({ types: [] }).size).toBe(0);
  });

  it('returns an empty map when datasource_mappings is an empty array', () => {
    expect(parseFieldMappings({ datasource_mappings: [] }).size).toBe(0);
  });

  it('parses a single entity with one column mapping', () => {
    const result = parseFieldMappings({
      datasource_mappings: [{ notification: { field_mappings: [{ key: { source: 'Key' } }] } }],
    });
    expect(result.size).toBe(1);
    const entity = result.get('notification');
    expect(entity).toBeDefined();
    expect(entity!.get('key')).toBe('Key');
  });

  it('parses multiple columns per entity preserving order', () => {
    const result = parseFieldMappings({
      datasource_mappings: [
        {
          notification: {
            source: 'notifications',
            field_mappings: [
              { key: { source: 'Key' } },
              { uuid: { source: 'guid' } },
              { text: { source: '_data' } },
            ],
          },
        },
      ],
    });
    const entity = result.get('notification')!;
    expect(entity.size).toBe(3);
    expect(entity.get('key')).toBe('Key');
    expect(entity.get('uuid')).toBe('guid');
    expect(entity.get('text')).toBe('_data');
  });

  it('parses multiple entities independently', () => {
    const result = parseFieldMappings({
      datasource_mappings: [
        {
          notification_type: {
            source: 'notification_types',
            field_mappings: [
              { name: { source: 'name2' } },
              { description: { source: '_description_text' } },
            ],
          },
        },
        {
          notification: {
            source: 'notifications',
            field_mappings: [{ key: { source: 'Key' } }],
          },
        },
      ],
    });
    expect(result.size).toBe(2);
    expect(result.get('notification_type')!.get('name')).toBe('name2');
    expect(result.get('notification')!.get('key')).toBe('Key');
  });

  it('skips entities that declare only a source (no field_mappings)', () => {
    const result = parseFieldMappings({
      datasource_mappings: [{ legacy_contact: { source: 'OldContactsTbl' } }],
    });
    expect(result.size).toBe(0);
  });

  it('skips entities with explicitly empty field_mappings array', () => {
    const result = parseFieldMappings({
      datasource_mappings: [{ notification: { source: 'notifications', field_mappings: [] } }],
    });
    expect(result.size).toBe(0);
  });

  it('merges field_mappings when the same entity appears twice', () => {
    const result = parseFieldMappings({
      datasource_mappings: [
        { notification: { field_mappings: [{ key: { source: 'Key' } }] } },
        { notification: { field_mappings: [{ uuid: { source: 'guid' } }] } },
      ],
    });
    const entity = result.get('notification')!;
    expect(entity.size).toBe(2);
    expect(entity.get('key')).toBe('Key');
    expect(entity.get('uuid')).toBe('guid');
  });

  describe('GATE 16 — strict validation at the loader boundary', () => {
    it('throws when datasourceData is a non-object primitive', () => {
      expect(() => parseFieldMappings('not-an-object' as never)).toThrow(/expected an object/i);
    });

    it('throws when datasource_mappings is an object, not an array', () => {
      expect(() => parseFieldMappings({ datasource_mappings: { not: 'an array' } })).toThrow(
        /must be an array/,
      );
    });

    it('throws when a mapping entry is null', () => {
      expect(() => parseFieldMappings({ datasource_mappings: [null] })).toThrow(
        /datasource_mappings\[0\] must be an object/,
      );
    });

    it('throws when a mapping entry has zero entity keys', () => {
      expect(() => parseFieldMappings({ datasource_mappings: [{}] })).toThrow(
        /must wrap exactly one entity name/,
      );
    });

    it('throws when a mapping entry has two entity keys', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [{ notification: {}, oops: {} }],
        }),
      ).toThrow(/must wrap exactly one entity name/);
    });

    it('throws when field_mappings is not an array', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [{ notification: { field_mappings: { key: { source: 'Key' } } } }],
        }),
      ).toThrow(/field_mappings must be an array/);
    });

    it('throws when a field_mapping entry has zero column keys', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [{ notification: { field_mappings: [{}] } }],
        }),
      ).toThrow(/must wrap exactly one column name/);
    });

    it('throws when a field_mapping declares neither source nor type_converter', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [{ notification: { field_mappings: [{ key: {} }] } }],
        }),
      ).toThrow(/must declare 'source' or 'type_converter'/);
    });

    it('throws when field_mappings[i].col.source is a number (typo)', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [{ notification: { field_mappings: [{ key: { source: 42 } }] } }],
        }),
      ).toThrow(/source must be a string/);
    });

    it('throws when the same logical column appears twice in one entity', () => {
      expect(() =>
        parseFieldMappings({
          datasource_mappings: [
            {
              notification: {
                field_mappings: [{ key: { source: 'Key' } }, { key: { source: 'AnotherKey' } }],
              },
            },
          ],
        }),
      ).toThrow(/declares column 'key' twice/);
    });
  });
});

describe('parseFieldConverters', () => {
  it('captures a per-field type_converter with no source (rename map stays empty)', () => {
    const data = {
      datasource_mappings: [
        { user: { field_mappings: [{ email: { type_converter: 'lowercaseEmail' } }] } },
      ],
    };
    const converters = parseFieldConverters(data);
    expect(converters.get('user')!.get('email')).toBe('lowercaseEmail');
    expect(parseFieldMappings(data).size).toBe(0);
  });

  it('captures both a rename and a type_converter for the same column', () => {
    const data = {
      datasource_mappings: [
        {
          user: {
            field_mappings: [{ email: { source: 'EMAIL', type_converter: 'lowercaseEmail' } }],
          },
        },
      ],
    };
    expect(parseFieldMappings(data).get('user')!.get('email')).toBe('EMAIL');
    expect(parseFieldConverters(data).get('user')!.get('email')).toBe('lowercaseEmail');
  });

  it('throws when type_converter is not a string', () => {
    expect(() =>
      parseFieldConverters({
        datasource_mappings: [{ user: { field_mappings: [{ email: { type_converter: 7 } }] } }],
      }),
    ).toThrow(/type_converter must be a string/);
  });

  it('returns an empty map when no field declares a type_converter', () => {
    const data = {
      datasource_mappings: [{ user: { field_mappings: [{ email: { source: 'EMAIL' } }] } }],
    };
    expect(parseFieldConverters(data).size).toBe(0);
  });
});

describe('getEntityFieldMap', () => {
  it('returns the entity map when present', () => {
    const mappings = parseFieldMappings({
      datasource_mappings: [{ notification: { field_mappings: [{ key: { source: 'Key' } }] } }],
    });
    expect(getEntityFieldMap(mappings, 'notification').get('key')).toBe('Key');
  });

  it('returns an empty map when the entity is not present', () => {
    const mappings = parseFieldMappings({
      datasource_mappings: [{ notification: { field_mappings: [{ key: { source: 'Key' } }] } }],
    });
    expect(getEntityFieldMap(mappings, 'other').size).toBe(0);
  });
});
