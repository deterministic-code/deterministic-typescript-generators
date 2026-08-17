import { describe, it, expect } from 'vitest';
import { crudFor, openApiToRouteRows, type OpenApiDocument } from './routeRows';

describe('crudFor', () => {
  it('classifies GET on a collection as list', () => {
    expect(crudFor('GET', '/api/contacts')).toBe('list');
  });

  it('classifies GET ending in an OpenAPI {id} param as read', () => {
    expect(crudFor('GET', '/api/contacts/{id}')).toBe('read');
  });

  it('classifies GET ending in an Express :id param as read', () => {
    expect(crudFor('GET', '/api/contacts/:id')).toBe('read');
  });

  it('classifies GET with a trailing slash after the param as read', () => {
    expect(crudFor('GET', '/api/contacts/{id}/')).toBe('read');
  });

  it('classifies POST as create', () => {
    expect(crudFor('POST', '/api/contacts')).toBe('create');
  });

  it('classifies PUT as update', () => {
    expect(crudFor('PUT', '/api/contacts/{id}')).toBe('update');
  });

  it('classifies PATCH as update', () => {
    expect(crudFor('PATCH', '/api/contacts/{id}')).toBe('update');
  });

  it('classifies DELETE as delete', () => {
    expect(crudFor('DELETE', '/api/contacts/{id}')).toBe('delete');
  });

  it('returns null for an unsupported method', () => {
    expect(crudFor('HEAD', '/api/contacts')).toBeNull();
  });
});

const CONTACT_DOC: OpenApiDocument = {
  components: {
    schemas: {
      create_contact: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
      contact: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/api/contacts': {
      get: {
        operationId: 'listContacts',
        tags: ['Contacts'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/contact' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Contacts'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/create_contact' } },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/contact' } },
            },
          },
        },
      },
    },
  },
};

describe('openApiToRouteRows', () => {
  it('carries the entity from the operation tag', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    expect(rows.every((row) => row.entity === 'Contacts')).toBe(true);
  });

  it('yields a null entity when the operation has no tags', () => {
    const rows = openApiToRouteRows({ paths: { '/widgets': { get: {} } } });
    expect(rows[0].entity).toBeNull();
  });

  it('marks a route custom when the operation carries x-implementation', () => {
    const rows = openApiToRouteRows({
      paths: { '/api/ping': { get: { 'x-implementation': 'custom.ts' } } },
    });
    expect(rows[0].isCustom).toBe(true);
  });

  it('marks a route not custom when x-implementation is absent', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    expect(rows.every((row) => row.isCustom === false)).toBe(true);
  });

  it('carries operationId onto the row name', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    const list = rows.find((row) => row.method === 'GET');
    expect(list?.name).toBe('listContacts');
  });

  it('carries the raw requestBody schema $ref onto request', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    const post = rows.find((row) => row.method === 'POST');
    expect(post?.request).toEqual({ $ref: '#/components/schemas/create_contact' });
  });

  it('carries the raw 2xx response schema $ref onto response', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    const post = rows.find((row) => row.method === 'POST');
    expect(post?.response).toEqual({ $ref: '#/components/schemas/contact' });
  });

  it('carries the raw array response schema for a GET list', () => {
    const rows = openApiToRouteRows(CONTACT_DOC);
    const list = rows.find((row) => row.method === 'GET');
    expect(list?.request).toBeUndefined();
    expect(list?.response).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/contact' },
    });
  });

  it('omits request and response when the operation carries neither', () => {
    const rows = openApiToRouteRows({ paths: { '/api/ping': { get: {} } } });
    expect(rows[0].request).toBeUndefined();
    expect(rows[0].response).toBeUndefined();
  });

  it('ignores a non-2xx response when choosing the success schema', () => {
    const rows = openApiToRouteRows({
      paths: {
        '/api/ping': {
          get: {
            responses: {
              '404': {
                content: {
                  'application/json': { schema: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    });
    expect(rows[0].response).toBeUndefined();
  });

  it('throws when the document has no paths', () => {
    expect(() => openApiToRouteRows({} as OpenApiDocument)).toThrow(/no `paths`/);
  });
});
