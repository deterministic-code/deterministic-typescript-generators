import { describe, it, expect } from 'vitest';
import { getMappedTableName } from '../getMappedTableName';

describe('getMappedTableName', () => {
  it('returns source when datasource_mappings entry exists for the entity', () => {
    const spec = {
      types: [
        {
          notification: {
            fields: [{ key: { type: 'string' } }],
          },
        },
      ],
      datasource_mappings: [
        {
          notification: {
            source: 'notifications',
          },
        },
      ],
    };
    const result = getMappedTableName(spec, 'notification');
    expect(result).toBe('notifications');
  });

  it('returns entity name when no mapping exists', () => {
    const spec = {
      types: [
        {
          notification: {
            fields: [{ key: { type: 'string' } }],
          },
        },
      ],
    };
    const result = getMappedTableName(spec, 'notification');
    expect(result).toBe('notification');
  });

  it('returns entity name when datasource_mappings exists but has no entry for the entity', () => {
    const spec = {
      types: [
        {
          notification: {
            fields: [{ key: { type: 'string' } }],
          },
        },
      ],
      datasource_mappings: [
        {
          other_type: {
            source: 'other_table',
          },
        },
      ],
    };
    const result = getMappedTableName(spec, 'notification');
    expect(result).toBe('notification');
  });

  it('returns entity name when datasource_mappings entry has no source (only field_mappings)', () => {
    const spec = {
      types: [
        {
          notification: {
            fields: [{ key: { type: 'string' } }, { name: { type: 'string' } }],
          },
        },
      ],
      datasource_mappings: [
        {
          notification: {
            field_mappings: [{ key: { source: 'Key' } }],
          },
        },
      ],
    };
    const result = getMappedTableName(spec, 'notification');
    expect(result).toBe('notification');
  });
});
