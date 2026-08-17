import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(
  datasource: SupportedDatasource,
  direction: 'to' | 'from',
  value: unknown,
): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new RangeError(
      `uuidFieldConverter[${datasource}].${direction} expected RFC-4122 UUID string, got '${String(value)}'`,
    );
  }
  return value;
}

function makeUuidConverter(datasource: SupportedDatasource): ITypeFieldConverter<string, string> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'uuid',
    to(value) {
      if (value === null) return null;
      return assertUuid(datasource, 'to', value);
    },
    from(value) {
      if (value === null) return null;
      return assertUuid(datasource, 'from', value);
    },
  };
}

export const uuidFieldConverter = makeUuidConverter('sqlite');
export const mysqlUuidFieldConverter = makeUuidConverter('mysql');
export const postgresUuidFieldConverter = makeUuidConverter('postgres');
