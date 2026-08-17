import { describe, it, expect } from 'vitest';
import { buildExample, type SchemaComponents } from './schemaExample';

const DOC: SchemaComponents = {
  components: {
    schemas: {
      contact: {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'integer' },
          uuid: { type: 'string', format: 'uuid' },
          created: { type: 'string', format: 'date-time' },
          name: { type: 'string' },
          nickname: { type: 'string', nullable: true },
          active: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          owner: { $ref: '#/components/schemas/contact' },
        },
      },
    },
  },
};

describe('buildExample', () => {
  it('produces placeholder values per JSON-Schema type and format', () => {
    const example = buildExample({ $ref: '#/components/schemas/contact' }, DOC) as Record<
      string,
      unknown
    >;
    expect(example).toMatchObject({
      id: 0,
      uuid: '00000000-0000-0000-0000-000000000000',
      created: '1970-01-01T00:00:00Z',
      name: 'string',
      nickname: null,
      active: false,
      tags: ['string'],
    });
  });

  it('stops a $ref cycle by emitting null at the self-reference', () => {
    const example = buildExample({ $ref: '#/components/schemas/contact' }, DOC) as Record<
      string,
      unknown
    >;
    expect(example.owner).toBeNull();
  });

  it('throws when a $ref has no matching component schema', () => {
    expect(() => buildExample({ $ref: '#/components/schemas/missing' }, DOC)).toThrow(
      /no matching component schema/,
    );
  });

  it('builds an array of the item example', () => {
    const example = buildExample(
      { type: 'array', items: { type: 'integer' } },
      { components: { schemas: {} } },
    );
    expect(example).toEqual([0]);
  });
});
