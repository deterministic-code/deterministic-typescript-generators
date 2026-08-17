export interface StandardDataSource<TId = number, TDate = string> {
  id: TId;
  created: TDate;
  updated: TDate;
}
