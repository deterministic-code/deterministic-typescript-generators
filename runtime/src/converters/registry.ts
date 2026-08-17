import type {
  ITypeFieldConverter,
  SupportedDatasource,
  SupportedLanguage,
} from './ITypeFieldConverter';
import {
  booleanFieldConverter,
  mysqlBooleanFieldConverter,
  postgresBooleanFieldConverter,
} from './booleanFieldConverter';
import {
  dateTimeFieldConverter,
  mysqlDateTimeFieldConverter,
  postgresDateTimeFieldConverter,
} from './dateTimeFieldConverter';
import { makeDateTimeStringConverter } from './dateTimeStringConverter';
import {
  binaryFieldConverter,
  mysqlBinaryFieldConverter,
  postgresBinaryFieldConverter,
} from './binaryFieldConverter';
import {
  uuidFieldConverter,
  mysqlUuidFieldConverter,
  postgresUuidFieldConverter,
} from './uuidFieldConverter';
import { makeUuidStringConverter } from './uuidStringConverter';
import { makeIdentityFieldConverter } from './identityFieldConverter';
import { makeDecimalFieldConverter } from './decimalFieldConverter';

export type DateTimeRepr = 'native' | 'string';
export type UuidRepr = 'native' | 'string';

/** The datetime/uuid representation the converter map should register (`settings.datasource.datetime` / `.uuid`); anything other than `'string'` resolves to the native converter. */
export interface DatasourceConverterSettings {
  datasource?: { datetime?: DateTimeRepr; uuid?: UuidRepr };
}

const IDENTITY_TYPES = [
  'string',
  'character',
  'number',
  'integer',
  'biginteger',
  'smallinteger',
  'float',
];

interface DialectConverters {
  boolean: ITypeFieldConverter;
  binary: ITypeFieldConverter;
  datetimeNative: ITypeFieldConverter;
  uuidNative: ITypeFieldConverter;
}

const DIALECTS: Record<SupportedDatasource, DialectConverters> = {
  sqlite: {
    boolean: booleanFieldConverter,
    binary: binaryFieldConverter,
    datetimeNative: dateTimeFieldConverter,
    uuidNative: uuidFieldConverter,
  },
  mysql: {
    boolean: mysqlBooleanFieldConverter,
    binary: mysqlBinaryFieldConverter,
    datetimeNative: mysqlDateTimeFieldConverter,
    uuidNative: mysqlUuidFieldConverter,
  },
  postgres: {
    boolean: postgresBooleanFieldConverter,
    binary: postgresBinaryFieldConverter,
    datetimeNative: postgresDateTimeFieldConverter,
    uuidNative: postgresUuidFieldConverter,
  },
};

function buildConverterMap(
  datasource: SupportedDatasource,
  reprs: { datetime?: DateTimeRepr; uuid?: UuidRepr },
): Map<string, ITypeFieldConverter> {
  const dialect = DIALECTS[datasource];
  const map = new Map<string, ITypeFieldConverter>();
  for (const t of IDENTITY_TYPES) {
    map.set(t, makeIdentityFieldConverter(t, datasource));
  }
  map.set('decimal', makeDecimalFieldConverter(datasource));
  map.set('boolean', dialect.boolean);
  map.set('binary', dialect.binary);
  map.set(
    'datetime',
    reprs.datetime === 'string' ? makeDateTimeStringConverter(datasource) : dialect.datetimeNative,
  );
  map.set(
    'uuid',
    reprs.uuid === 'string' ? makeUuidStringConverter(datasource) : dialect.uuidNative,
  );
  return map;
}

/** Resolve the converter map for a dialect, registering the datetime/uuid converter that matches the representation setting (`settings.datasource.datetime` / `.uuid`). Absent settings resolve to the native converters. */
export function convertersFromSettings(
  settings: DatasourceConverterSettings,
  datasource: SupportedDatasource,
): Map<string, ITypeFieldConverter> {
  return buildConverterMap(datasource, {
    datetime: settings?.datasource?.datetime,
    uuid: settings?.datasource?.uuid,
  });
}

export function getDefaultConverters(
  fromDatasource: SupportedDatasource,
  toLanguage: SupportedLanguage,
): Map<string, ITypeFieldConverter> {
  if (toLanguage !== 'typescript') {
    throw new Error(
      `getDefaultConverters: unsupported language '${toLanguage}' (only 'typescript' supported)`,
    );
  }
  return buildConverterMap(fromDatasource, { datetime: 'native', uuid: 'native' });
}
