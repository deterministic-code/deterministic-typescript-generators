import { PrimaryKey } from '../PrimaryKey';

describe('PrimaryKey', () => {
  it('exposes the column and id_type it was constructed with', () => {
    const pk = new PrimaryKey('key', 'string');
    expect(pk.column).toBe('key');
    expect(pk.idType).toBe('string');
  });

  it('throws when the column is empty', () => {
    expect(() => new PrimaryKey('', 'integer')).toThrow(/requires a column/);
  });

  it('throws when the id_type is not a known StandardIdType', () => {
    expect(() => new PrimaryKey('id', 'int' as never)).toThrow(/requires an id_type/);
  });

  it('collapses biginteger to integer for the route id shape', () => {
    expect(new PrimaryKey('id', 'biginteger').routeIdType).toBe('integer');
    expect(new PrimaryKey('id', 'integer').routeIdType).toBe('integer');
    expect(new PrimaryKey('id', 'uuid').routeIdType).toBe('uuid');
    expect(new PrimaryKey('id', 'string').routeIdType).toBe('string');
  });

  it('addresses the key via a member segment named for the column by default', () => {
    expect(new PrimaryKey('id', 'integer').routeSegment()).toBe('/:id');
    expect(new PrimaryKey('key', 'string').routeSegment()).toBe('/:key');
  });

  it('honors an explicit param name in the member segment', () => {
    expect(new PrimaryKey('id', 'integer').routeSegment('projectId')).toBe('/:projectId');
  });

  it('reads the key value off a row', () => {
    const pk = new PrimaryKey('key', 'string');
    expect(pk.valueOf({ key: 'cnt-001', name: 'x' })).toBe('cnt-001');
  });

  it('matches the row addressed by an id', () => {
    const pk = new PrimaryKey('id', 'integer');
    expect(pk.matches({ id: 7 }, 7)).toBe(true);
    expect(pk.matches({ id: 7 }, 8)).toBe(false);
  });

  it('types a referencing foreign key as number for integer/biginteger keys', () => {
    expect(new PrimaryKey('id', 'integer').bodyFieldType()).toBe('number');
    expect(new PrimaryKey('id', 'biginteger').bodyFieldType()).toBe('number');
  });

  it('types a referencing foreign key as string for uuid/string keys', () => {
    expect(new PrimaryKey('id', 'uuid').bodyFieldType()).toBe('string');
    expect(new PrimaryKey('key', 'string').bodyFieldType()).toBe('string');
  });
});
