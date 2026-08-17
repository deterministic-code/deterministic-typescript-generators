import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

/** decimal is carried as an exact string in generated code (the DB stores NUMERIC/DECIMAL(p,s)). `from` stringifies whatever the driver returns — a number on sqlite/mysql, already a string on postgres — so the language value is always the exact decimal string, avoiding float rounding. */
export function makeDecimalFieldConverter(
  datasource: SupportedDatasource = 'sqlite',
): ITypeFieldConverter<number | string, string> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'decimal',
    from(value) {
      return value === null || value === undefined ? null : String(value);
    },
    to(value) {
      return value;
    },
  };
}

export const decimalFieldConverter = makeDecimalFieldConverter('sqlite');
