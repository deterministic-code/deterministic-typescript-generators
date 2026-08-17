import { StandardDataSource } from '../types/StandardDataSource';
import { ICrudRepository, OptimisticConcurrencyOptions } from './ICrudRepository';

export interface IStandardCrudRepository<
  T extends StandardDataSource<TId, TDate>,
  TId = number,
  TDate = string,
> extends Omit<ICrudRepository<T, TId>, 'add' | 'update' | 'updateBy'> {
  add(data: Omit<T, keyof StandardDataSource<TId, TDate>>): Promise<T>;
  update(
    id: TId,
    data: Partial<Omit<T, keyof StandardDataSource<TId, TDate>>>,
    opts?: OptimisticConcurrencyOptions,
  ): Promise<T | null>;
  updateBy(
    column: string,
    value: unknown,
    data: Partial<Omit<T, keyof StandardDataSource<TId, TDate>>>,
  ): Promise<T[]>;
}
