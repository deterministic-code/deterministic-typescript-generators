import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

export function makeIdentityFieldConverter<T = unknown>(
  datasourceType: string,
  datasource: SupportedDatasource = 'sqlite',
): ITypeFieldConverter<T, T> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType,
    from(value) {
      return value;
    },
    to(value) {
      return value;
    },
  };
}
