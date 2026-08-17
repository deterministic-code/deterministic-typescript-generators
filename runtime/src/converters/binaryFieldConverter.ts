import { Buffer } from 'node:buffer';
import type { ITypeFieldConverter, SupportedDatasource } from './ITypeFieldConverter';

/** binary is carried as a base64 string in generated code — that is the OpenAPI `format: byte` wire shape, so it round-trips over JSON with no seam-A transform (mirrors the decimal string-carry design). `to` decodes the base64 string to the `Buffer` the driver binds; `from` re-encodes the driver's `Buffer` back to base64. */
function makeBufferBinaryConverter(
  datasource: SupportedDatasource,
): ITypeFieldConverter<Buffer, string> {
  return {
    fromDatasource: datasource,
    toLanguage: 'typescript',
    datasourceType: 'binary',
    to(value) {
      if (value === null) return null;
      if (typeof value !== 'string') {
        throw new TypeError(
          `binaryFieldConverter[${datasource}].to expected a base64 string, got ${(value as { constructor?: { name?: string } } | null)?.constructor?.name ?? typeof value}`,
        );
      }
      return Buffer.from(value, 'base64');
    },
    from(value) {
      if (value === null) return null;
      if (!Buffer.isBuffer(value)) {
        throw new TypeError(
          `binaryFieldConverter[${datasource}].from expected Buffer, got ${(value as { constructor?: { name?: string } } | null)?.constructor?.name ?? typeof value}`,
        );
      }
      return value.toString('base64');
    },
  };
}

export const binaryFieldConverter = makeBufferBinaryConverter('sqlite');
export const mysqlBinaryFieldConverter = makeBufferBinaryConverter('mysql');
export const postgresBinaryFieldConverter = makeBufferBinaryConverter('postgres');
