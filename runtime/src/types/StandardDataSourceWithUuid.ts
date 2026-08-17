import { StandardDataSource } from './StandardDataSource';

export interface StandardDataSourceWithUuid<
  TId = number,
  TUuid = string,
  TDate = string,
> extends StandardDataSource<TId, TDate> {
  uuid: TUuid;
}
