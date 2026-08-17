import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';
import { makeIdentityFieldConverter } from './identityFieldConverter';

/** The `datetime: string` representation carries datetimes as ISO strings end-to-end, so the converter is a passthrough (the string wire form is already the storage form). */
export function makeDateTimeStringConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<string, string> {
  return makeIdentityFieldConverter<string>('datetime', datasource);
}

export const dateTimeStringConverter = makeDateTimeStringConverter('sqlite');
export const mysqlDateTimeStringConverter = makeDateTimeStringConverter('mysql');
export const postgresDateTimeStringConverter = makeDateTimeStringConverter('postgres');
