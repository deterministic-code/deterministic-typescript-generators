import { describe, expect, it } from 'vitest';
import { getMappedTableName } from '../getMappedTableName';

describe('datasource_mappings table name wiring', () => {
  it('getMappedTableName resolves to mapped table name when entry exists', () => {
    const spec = {
      types: [
        {
          notification: {
            skip_migrations: true,
            fields: [{ key: { type: 'string', size: 256 } }],
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

  it('getMappedTableName falls back to entity name when no mapping exists', () => {
    const spec = {
      types: [
        {
          notification: {
            skip_migrations: true,
            fields: [{ key: { type: 'string', size: 256 } }],
          },
        },
      ],
    };

    const result = getMappedTableName(spec, 'notification');
    expect(result).toBe('notification');
  });

  it('getMappedTableName falls back when mapping has only field_mappings', () => {
    const spec = {
      types: [
        {
          user: {
            fields: [
              { email: { type: 'string', size: 256 } },
              { name: { type: 'string', size: 256 } },
            ],
          },
        },
      ],
      datasource_mappings: [
        {
          user: {
            field_mappings: [{ email: { source: 'EMAIL' } }],
          },
        },
      ],
    };

    const result = getMappedTableName(spec, 'user');
    expect(result).toBe('user');
  });

  it('getMappedTableName handles multiple mappings', () => {
    const spec = {
      types: [
        { notification: { fields: [{ key: { type: 'string' } }] } },
        { user: { fields: [{ email: { type: 'string' } }] } },
      ],
      datasource_mappings: [
        {
          notification: {
            source: 'notifications',
          },
        },
        {
          user: {
            source: 'users_table',
          },
        },
      ],
    };

    expect(getMappedTableName(spec, 'notification')).toBe('notifications');
    expect(getMappedTableName(spec, 'user')).toBe('users_table');
  });
});
