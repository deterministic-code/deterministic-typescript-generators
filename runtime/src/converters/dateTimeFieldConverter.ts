import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

function makeIsoStringDateTimeConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<string, Date> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'datetime',
    to(value) {
      if (value === null) return null;
      if (!(value instanceof Date)) {
        throw new TypeError(
          `dateTimeFieldConverter[${datasource}].to expected Date, got ${typeof value}`,
        );
      }
      if (Number.isNaN(value.getTime())) {
        throw new RangeError(`dateTimeFieldConverter[${datasource}].to received an invalid Date`);
      }
      return value.toISOString();
    },
    from(value) {
      if (value === null) return null;
      if (typeof value !== 'string') {
        throw new TypeError(
          `dateTimeFieldConverter[${datasource}].from expected ISO string, got ${typeof value}`,
        );
      }
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new RangeError(
          `dateTimeFieldConverter[${datasource}].from received unparseable string '${value}'`,
        );
      }
      return d;
    },
  };
}

function makeNativeDateTimeConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<Date | string, Date> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'datetime',
    to(value) {
      if (value === null) return null;
      if (!(value instanceof Date)) {
        throw new TypeError(
          `dateTimeFieldConverter[${datasource}].to expected Date, got ${typeof value}`,
        );
      }
      if (Number.isNaN(value.getTime())) {
        throw new RangeError(`dateTimeFieldConverter[${datasource}].to received an invalid Date`);
      }
      return value;
    },
    from(value) {
      if (value === null) return null;
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
          throw new RangeError(
            `dateTimeFieldConverter[${datasource}].from received an invalid Date`,
          );
        }
        return value;
      }
      if (typeof value === 'string') {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
          throw new RangeError(
            `dateTimeFieldConverter[${datasource}].from received unparseable string '${value}'`,
          );
        }
        return d;
      }
      throw new TypeError(
        `dateTimeFieldConverter[${datasource}].from expected Date or string, got ${typeof value}`,
      );
    },
  };
}

export const dateTimeFieldConverter = makeIsoStringDateTimeConverter('sqlite');
export const mysqlDateTimeFieldConverter = makeNativeDateTimeConverter('mysql');
export const postgresDateTimeFieldConverter = makeNativeDateTimeConverter('postgres');
