import type { ITypeFieldConverter, SupportedDatasource } from '../converters/ITypeFieldConverter';
import { getDefaultConverters } from '../converters/registry';
import type { FieldMappingTranslator } from './FieldMappingTranslator';

/**
 * Serialize a value for a column with no declared type by inferring the converter
 * from the value's runtime type — so undeclared boolean/Date values go through the
 * dialect's registered converter (integer for sqlite/mysql, pass-through for postgres)
 * instead of a hardcoded coercion. Every other value passes through untouched.
 */
export function inferToStorageValue(
  converters: ReadonlyMap<string, ITypeFieldConverter>,
  value: unknown,
): unknown {
  if (typeof value === 'boolean') {
    return converters.get('boolean')?.to(value as never) ?? value;
  }
  if (value instanceof Date) {
    return converters.get('datetime')?.to(value as never) ?? value;
  }
  return value;
}

export interface FieldConverterOptions {
  columnTypes?: Readonly<Record<string, string>>;
  converters?: ReadonlyMap<string, ITypeFieldConverter>;
  fieldConverters?: ReadonlyMap<string, ITypeFieldConverter>;
}

export class FieldConverter {
  readonly columnTypes: Readonly<Record<string, string>>;
  readonly converters: ReadonlyMap<string, ITypeFieldConverter>;
  private readonly fieldConverters: ReadonlyMap<string, ITypeFieldConverter>;

  constructor(
    datasource: SupportedDatasource,
    private readonly translator: FieldMappingTranslator,
    options: FieldConverterOptions = {},
  ) {
    this.columnTypes = options.columnTypes ?? {};
    this.converters = options.converters ?? getDefaultConverters(datasource, 'typescript');
    this.fieldConverters = options.fieldConverters ?? new Map();
  }

  /** A column with a declared datasource type MUST resolve a converter — a missing one is a registry/wiring bug and throws instead of silently binding raw. Columns with no declared type (framework columns, or a repo configured with partial columnTypes) return `undefined` for the caller to pass through. */
  converterFor(column: string): ITypeFieldConverter | undefined {
    const custom = this.fieldConverters.get(column);
    if (custom) return custom;
    const t = this.columnTypes[column];
    if (t === undefined) return undefined;
    const conv = this.converters.get(t);
    if (!conv) {
      throw new Error(
        `FieldConverter: no converter registered for datasource type '${t}' (column '${column}')`,
      );
    }
    return conv;
  }

  toStorage(column: string, value: unknown): unknown {
    const conv = this.converterFor(column);
    return conv ? conv.to(value as never) : inferToStorageValue(this.converters, value);
  }

  fromStorageRow<R>(row: R): R {
    if (row === null || typeof row !== 'object') return row;
    const translated = this.translator.hasMappings
      ? (this.translator.toLogicalRow(row as Record<string, unknown>) as Record<string, unknown>)
      : ({ ...(row as Record<string, unknown>) } as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [logicalKey, val] of Object.entries(translated)) {
      const conv = this.converterFor(logicalKey);
      out[logicalKey] = conv ? conv.from(val as never) : val;
    }
    return out as R;
  }
}
