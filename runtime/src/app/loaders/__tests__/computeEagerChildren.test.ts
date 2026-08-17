import { describe, expect, it } from 'vitest';

import { computeEagerChildren, type EagerLoadGate } from '../computeEagerChildren';

type ViewTypesDoc = Parameters<typeof computeEagerChildren>[1];
type DatasourceDoc = Parameters<typeof computeEagerChildren>[3];

const treeFor = (...fields: string[]): EagerLoadGate => {
  const m = new Map();
  for (const f of fields) m.set(f, new Map());
  return m;
};

describe('computeEagerChildren', () => {
  it('returns direct-FK array field match', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                posts: {
                  type: 'datasource_types.post[]',
                  references: 'datasource_types.post.author_id',
                },
              },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, '*')).toEqual([
      { fieldName: 'posts', childTable: 'post', refColumn: 'author_id' },
    ]);
  });

  it('skips M2M when no datasource doc is provided', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                tags: {
                  type: 'datasource_types.tag[]',
                  references: 'datasource_types.user_tag.user_id',
                },
              },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, '*')).toEqual([]);
  });

  it('emits M2M spec with joinTable + joinChildColumn when junction is in datasource doc', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                tags: {
                  type: 'datasource_types.tag[]',
                  references: 'datasource_types.user_tag.user_id',
                },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = {
      types: [
        {
          user_tag: {
            datasource_type: 'many-to-many',
            fields: [
              { user_id: { type: 'number', references: 'user.id' } },
              { tag_id: { type: 'number', references: 'tag.id' } },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, '*', datasourceDoc)).toEqual([
      {
        fieldName: 'tags',
        childTable: 'tag',
        refColumn: 'user_id',
        joinTable: 'user_tag',
        joinChildColumn: 'tag_id',
      },
    ]);
  });

  it('auto-detects M2M junction when reference is omitted on the view field', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          contact: {
            inherits: 'datasource_types.contact',
            fields: [
              {
                labels: {
                  type: 'datasource_types.label[]',
                },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = {
      types: [
        {
          contact_label: {
            datasource_type: 'many-to-many',
            fields: [
              { contact_id: { type: 'number', references: 'contact.id' } },
              { labels_id: { type: 'number', references: 'label.id' } },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('contact', doc, '*', datasourceDoc)).toEqual([
      {
        fieldName: 'labels',
        childTable: 'label',
        refColumn: 'contact_id',
        joinTable: 'contact_label',
        joinChildColumn: 'labels_id',
      },
    ]);
  });

  it('declines auto-detect when more than one M2M junction matches (ambiguous)', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          contact: {
            inherits: 'datasource_types.contact',
            fields: [
              {
                labels: { type: 'datasource_types.label[]' },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = {
      types: [
        {
          contact_label_a: {
            datasource_type: 'many-to-many',
            fields: [
              { contact_id: { type: 'number', references: 'contact.id' } },
              { labels_id: { type: 'number', references: 'label.id' } },
            ],
          },
        },
        {
          contact_label_b: {
            datasource_type: 'many-to-many',
            fields: [
              { contact_id: { type: 'number', references: 'contact.id' } },
              { labels_id: { type: 'number', references: 'label.id' } },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('contact', doc, '*', datasourceDoc)).toEqual([]);
  });

  it('skips M2M when junction table is absent from datasource doc', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                tags: {
                  type: 'datasource_types.tag[]',
                  references: 'datasource_types.user_tag.user_id',
                },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = { types: [] };
    expect(computeEagerChildren('user', doc, '*', datasourceDoc)).toEqual([]);
  });

  it('mixes direct-FK and M2M children on the same view type', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                posts: {
                  type: 'datasource_types.post[]',
                  references: 'datasource_types.post.author_id',
                },
              },
              {
                tags: {
                  type: 'datasource_types.tag[]',
                  references: 'datasource_types.user_tag.user_id',
                },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = {
      types: [
        {
          user_tag: {
            datasource_type: 'many-to-many',
            fields: [
              { user_id: { type: 'number', references: 'user.id' } },
              { tag_id: { type: 'number', references: 'tag.id' } },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, '*', datasourceDoc)).toEqual([
      { fieldName: 'posts', childTable: 'post', refColumn: 'author_id' },
      {
        fieldName: 'tags',
        childTable: 'tag',
        refColumn: 'user_id',
        joinTable: 'user_tag',
        joinChildColumn: 'tag_id',
      },
    ]);
  });

  it('includes only fields named in the tree gate', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                posts: {
                  type: 'datasource_types.post[]',
                  references: 'datasource_types.post.author_id',
                },
              },
              {
                tags: {
                  type: 'datasource_types.tag[]',
                  references: 'datasource_types.user_tag.user_id',
                },
              },
            ],
          },
        },
      ],
    };
    const datasourceDoc: DatasourceDoc = {
      types: [
        {
          user_tag: {
            datasource_type: 'many-to-many',
            fields: [
              { user_id: { type: 'number', references: 'user.id' } },
              { tag_id: { type: 'number', references: 'tag.id' } },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, treeFor('posts'), datasourceDoc)).toEqual([
      { fieldName: 'posts', childTable: 'post', refColumn: 'author_id' },
    ]);
  });

  it('returns empty when gate is null, undefined, or empty Map', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          user: {
            inherits: 'datasource_types.user',
            fields: [
              {
                posts: {
                  type: 'datasource_types.post[]',
                  references: 'datasource_types.post.author_id',
                },
              },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('user', doc, null)).toEqual([]);
    expect(computeEagerChildren('user', doc, undefined)).toEqual([]);
    expect(computeEagerChildren('user', doc, new Map())).toEqual([]);
  });

  it('returns empty when entity has no view type', () => {
    const doc: ViewTypesDoc = {
      types: [{ user: { inherits: 'datasource_types.user', fields: [] } }],
    };
    expect(computeEagerChildren('application', doc, '*')).toEqual([]);
  });

  it('handles multiple array fields on one view type', () => {
    const doc: ViewTypesDoc = {
      types: [
        {
          application: {
            inherits: 'datasource_types.application',
            fields: [
              {
                settings: {
                  type: 'datasource_types.application_setting[]',
                  references: 'datasource_types.application_setting.application_id',
                },
              },
              {
                uris: {
                  type: 'datasource_types.application_uri[]',
                  references: 'datasource_types.application_uri.application_id',
                },
              },
            ],
          },
        },
      ],
    };
    expect(computeEagerChildren('application', doc, '*')).toEqual([
      { fieldName: 'settings', childTable: 'application_setting', refColumn: 'application_id' },
      { fieldName: 'uris', childTable: 'application_uri', refColumn: 'application_id' },
    ]);
  });

  it('returns empty when doc is null or undefined', () => {
    expect(computeEagerChildren('user', null, '*')).toEqual([]);
    expect(computeEagerChildren('user', undefined, '*')).toEqual([]);
  });
});
