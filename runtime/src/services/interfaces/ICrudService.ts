import { IServiceBase } from './IServiceBase';
import { NameValue } from './NameValue';

interface CrudServiceOptimisticConcurrencyOptions {
  expectedUpdated?: string;
}

export interface ICrudService<
  T extends { id: number | string },
  TMutate = Omit<T, 'id'>,
> extends IServiceBase<T> {
  create(data: TMutate): Promise<T>;
  find(query: string, args: NameValue[]): Promise<T[]>;
  findById(id: number | string): Promise<T | null>;
  findBy(whereArgs: NameValue[]): Promise<T[]>;
  update(
    id: number | string,
    data: Partial<TMutate>,
    opts?: CrudServiceOptimisticConcurrencyOptions,
  ): Promise<T | null>;
  patch(
    id: number | string,
    data: Partial<TMutate>,
    opts?: CrudServiceOptimisticConcurrencyOptions,
  ): Promise<T | null>;
  delete(id: number | string, opts?: CrudServiceOptimisticConcurrencyOptions): Promise<boolean>;
  updateBy(whereArgs: NameValue[], data: Partial<TMutate>): Promise<number>;
  deleteBy(whereArgs: NameValue[]): Promise<number>;
}
