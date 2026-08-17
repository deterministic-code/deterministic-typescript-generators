import { NameValue } from './NameValue';

export interface IServiceBase<T> {
  query(command: string, args: NameValue[]): Promise<T[]>;
  findAll(): Promise<T[]>;
}
