import { expectTypeOf } from 'vitest';
import type { IRepository } from '../IRepository';
import type { IDatasource } from '../IDatasource';
import type { ISetup } from '../ISetup';
import type { ICrudRepository, OptimisticConcurrencyOptions } from '../ICrudRepository';
import type { IStandardCrudRepository } from '../IStandardCrudRepository';
import type { StandardDataSource } from '../../types/StandardDataSource';

interface ExampleRow {
  id: number;
  name: string;
}

interface ExampleStandardRow extends StandardDataSource {
  name: string;
}

describe('repositories interface contracts', () => {
  it('IRepository exposes only query', () => {
    expectTypeOf<IRepository>().toHaveProperty('query');
    expectTypeOf<keyof IRepository>().toEqualTypeOf<'query'>();
  });

  it('IDatasource exposes open/query/close', () => {
    expectTypeOf<IDatasource>().toHaveProperty('open');
    expectTypeOf<IDatasource>().toHaveProperty('query');
    expectTypeOf<IDatasource>().toHaveProperty('close');
  });

  it('ISetup exposes run', () => {
    expectTypeOf<ISetup>().toHaveProperty('run');
    expectTypeOf<keyof ISetup>().toEqualTypeOf<'run'>();
  });

  it('ICrudRepository extends IRepository and adds CRUD methods', () => {
    expectTypeOf<ICrudRepository<ExampleRow>>().toMatchTypeOf<IRepository>();
    expectTypeOf<ICrudRepository<ExampleRow>['find']>().parameters.toEqualTypeOf<[number]>();
    expectTypeOf<
      ICrudRepository<ExampleRow>['find']
    >().returns.resolves.toEqualTypeOf<ExampleRow | null>();
    expectTypeOf<ICrudRepository<ExampleRow>['findAll']>().returns.resolves.toEqualTypeOf<
      ExampleRow[]
    >();
    expectTypeOf<ICrudRepository<ExampleRow>['findBy']>().parameters.toEqualTypeOf<
      [string, unknown]
    >();
    expectTypeOf<ICrudRepository<ExampleRow>['add']>().parameters.toEqualTypeOf<
      [Omit<ExampleRow, 'id'>]
    >();
    expectTypeOf<ICrudRepository<ExampleRow>['update']>().parameters.toEqualTypeOf<
      [number, Partial<Omit<ExampleRow, 'id'>>, OptimisticConcurrencyOptions?]
    >();
    expectTypeOf<ICrudRepository<ExampleRow>['delete']>().parameters.toEqualTypeOf<
      [number, OptimisticConcurrencyOptions?]
    >();
    expectTypeOf<ICrudRepository<ExampleRow>['delete']>().returns.resolves.toEqualTypeOf<boolean>();
  });

  it('IStandardCrudRepository omits StandardDataSource keys from add/update payloads', () => {
    expectTypeOf<IStandardCrudRepository<ExampleStandardRow>>().toHaveProperty('query');
    expectTypeOf<IStandardCrudRepository<ExampleStandardRow>['add']>().parameters.toEqualTypeOf<
      [Omit<ExampleStandardRow, keyof StandardDataSource>]
    >();
    expectTypeOf<IStandardCrudRepository<ExampleStandardRow>['update']>().parameters.toEqualTypeOf<
      [
        number,
        Partial<Omit<ExampleStandardRow, keyof StandardDataSource>>,
        OptimisticConcurrencyOptions?,
      ]
    >();
  });
});
