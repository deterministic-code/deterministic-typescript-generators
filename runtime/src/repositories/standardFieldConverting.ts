import { randomUUID } from 'node:crypto';
import type { ITypeFieldConverter } from '../converters/ITypeFieldConverter';
import type { IPrimaryKeyService } from './IPrimaryKeyService';
import { inferToStorageValue } from './fieldConverting';

/**
 * Assemble the ordered INSERT column/value pairs a `*StandardRepository` writes:
 * the caller/generated id first (only when preset for a string/uuid key), then the
 * caller's data, the optional `uuid`, and the `created`/`updated` timestamps left as
 * a `Date` so the datetime converter — not a hardcoded `.toISOString()` — owns the wire form.
 */
export function standardInsertEntries(
  record: Record<string, unknown>,
  opts: { presetId: unknown; withUuidColumn: boolean; now: Date },
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [...Object.entries(record)];
  if (opts.presetId !== undefined) entries.unshift(['id', opts.presetId]);
  if (opts.withUuidColumn) entries.push(['uuid', randomUUID()]);
  entries.push(['created', opts.now], ['updated', opts.now]);
  return entries;
}

export type StandardIdType = 'integer' | 'biginteger' | 'uuid' | 'string';

/** The construction options shared by every dialect `*StandardRepository` (each dialect re-exports this rather than re-declaring the identical shape). */
export interface StandardRepositoryOptions {
  columnTypes?: Readonly<Record<string, string>>;
  converters?: ReadonlyMap<string, ITypeFieldConverter>;
  /** The entity this repository serves — resolves its {@link PrimaryKey} (and thus id_type) through {@link primaryKeys}. */
  entityName: string;
  /** The one authority that resolves each entity's primary key (column + id_type), injected from the composition root. */
  primaryKeys: IPrimaryKeyService;
  withUuidColumn?: boolean;
  useStoredProcedures?: boolean;
  useOptimisticConcurrency?: boolean;
  entityNamePlural?: string;
}

/** The ordered INSERT entries plus the pre-known id (for string/uuid keys) a standard repo's `add()` needs — one call so each dialect repo doesn't re-derive it. */
export function buildStandardInsert<TId>(
  record: Record<string, unknown>,
  opts: { idType: StandardIdType; withUuidColumn: boolean; now: Date },
): { entries: Array<[string, unknown]>; presetId: TId | undefined } {
  const presetId = resolvePresetId<TId>(opts.idType, record);
  const entries = standardInsertEntries(record, {
    presetId,
    withUuidColumn: opts.withUuidColumn,
    now: opts.now,
  });
  return { entries, presetId };
}

/** The id a standard repo knows before INSERT: a caller-supplied one for `string`, a caller/generated one for `uuid`, or `undefined` for an auto-increment key the DB assigns. */
function resolvePresetId<TId>(
  idType: StandardIdType,
  data: Record<string, unknown>,
): TId | undefined {
  if (idType === 'string') {
    if (data['id'] === undefined) {
      throw new Error("Caller-supplied id required when idType='string'");
    }
    return data['id'] as TId;
  }
  if (idType === 'uuid') return (data['id'] ?? randomUUID()) as TId;
  return undefined;
}

/** Coerce a DB-assigned auto-increment id to the configured numeric width. */
export function coerceScalarId<TId>(idType: StandardIdType, raw: number | bigint): TId {
  return (idType === 'biginteger' ? BigInt(raw) : Number(raw)) as TId;
}

/** Coerce the id a stored procedure returned (a bigint or string) to the configured id type. */
export function coerceSpReturnedId<TId>(idType: StandardIdType, raw: bigint | string): TId {
  if (idType === 'uuid' || idType === 'string') return String(raw) as unknown as TId;
  if (idType === 'biginteger') return BigInt(raw) as unknown as TId;
  return Number(raw) as unknown as TId;
}

/**
 * The write/read value converter shared by the dialect `*StandardRepository`
 * classes. Unlike {@link FieldConverter} (which drives the CRUD repos and throws
 * on a declared-but-unregistered type), this is deliberately **lenient**: a column
 * with no declared type — or one whose declared type has no registered converter —
 * falls back to {@link inferToStorageValue}, so auto-set values like the `created` /
 * `updated` timestamps flow through the dialect's datetime converter instead of a
 * hardcoded coercion.
 */
export class StandardFieldConverter {
  private readonly columnTypes: Readonly<Record<string, string>>;
  private readonly converters: ReadonlyMap<string, ITypeFieldConverter>;
  private readonly hasColumnTypes: boolean;

  constructor(
    converters: ReadonlyMap<string, ITypeFieldConverter>,
    columnTypes?: Readonly<Record<string, string>>,
  ) {
    this.converters = converters;
    this.columnTypes = columnTypes ?? {};
    this.hasColumnTypes = Object.keys(this.columnTypes).length > 0;
  }

  applyTo(column: string, value: unknown): unknown {
    if (!this.hasColumnTypes) return inferToStorageValue(this.converters, value);
    const t = this.columnTypes[column];
    const conv = t ? this.converters.get(t) : undefined;
    if (!conv) return inferToStorageValue(this.converters, value);
    return conv.to(value as never);
  }

  applyFrom<R>(row: R): R {
    if (!this.hasColumnTypes || row === null || typeof row !== 'object') return row;
    const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const [col, val] of Object.entries(out)) {
      const t = this.columnTypes[col];
      if (!t) continue;
      const conv = this.converters.get(t);
      if (!conv) continue;
      out[col] = conv.from(val as never);
    }
    return out as R;
  }
}
