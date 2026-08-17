import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';
import { makeIdentityFieldConverter } from './identityFieldConverter';

/** The `uuid: string` representation treats a uuid as an opaque string, so the converter is a passthrough — no RFC-4122 validation (that is the `uuid: native` converter's job). */
export function makeUuidStringConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<string, string> {
  return makeIdentityFieldConverter<string>('uuid', datasource);
}

export const uuidStringConverter = makeUuidStringConverter('sqlite');
export const mysqlUuidStringConverter = makeUuidStringConverter('mysql');
export const postgresUuidStringConverter = makeUuidStringConverter('postgres');
