import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

function makeIntegerBooleanConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<number, boolean> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'boolean',
    to(value) {
      if (value === null) return null;
      if (typeof value !== 'boolean') {
        throw new TypeError(
          `booleanFieldConverter[${datasource}].to expected boolean, got ${typeof value}`,
        );
      }
      return value ? 1 : 0;
    },
    from(value) {
      if (value === null) return null;
      if (value !== 0 && value !== 1) {
        throw new RangeError(
          `booleanFieldConverter[${datasource}].from expected 0 or 1, got ${String(value)}`,
        );
      }
      return value === 1;
    },
  };
}

function makeNativeBooleanConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<boolean, boolean> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'boolean',
    to(value) {
      if (value === null) return null;
      if (typeof value !== 'boolean') {
        throw new TypeError(
          `booleanFieldConverter[${datasource}].to expected boolean, got ${typeof value}`,
        );
      }
      return value;
    },
    from(value) {
      if (value === null) return null;
      if (typeof value !== 'boolean') {
        throw new TypeError(
          `booleanFieldConverter[${datasource}].from expected boolean, got ${typeof value}`,
        );
      }
      return value;
    },
  };
}

export const booleanFieldConverter = makeIntegerBooleanConverter('sqlite');
export const mysqlBooleanFieldConverter = makeIntegerBooleanConverter('mysql');
export const postgresBooleanFieldConverter = makeNativeBooleanConverter('postgres');
