import { randomUUID } from 'node:crypto';
import { PreconditionFailedError } from '../errors/AppError';
import {
  coerceSpReturnedId,
  type StandardFieldConverter,
  type StandardIdType,
} from './standardFieldConverting';

export interface StandardSpClient {
  invokeReturningId(procName: string, params: ReadonlyArray<unknown>): Promise<bigint | string>;
  invokeReturningAffected(procName: string, params: ReadonlyArray<unknown>): Promise<number>;
  invokeReturningRows<R>(procName: string, params: ReadonlyArray<unknown>): Promise<R[]>;
}

/**
 * The instance state the stored-procedure write path needs from a dialect
 * `*StandardRepository`. The SP path is pure proc invocation with no dialect SQL, so
 * mysql and postgres drive the identical implementation here instead of copying it.
 */
export interface StandardSpHost<T, TId> {
  readonly spClient: StandardSpClient | null;
  readonly entityName: string;
  readonly useOptimisticConcurrency: boolean;
  readonly fieldConverter: StandardFieldConverter;
  readonly idType: StandardIdType;
  find(id: TId): Promise<T | null>;
}

/**
 * The stored-procedure delete path shared across dialects: an optimistic-concurrency
 * variant (`delete_<entity>_optimistic_concurrency`, which must affect exactly one row)
 * and a plain `delete_<entity>`. Returns `true` when a row was removed.
 */
export async function deleteViaSp<T, TId>(
  host: StandardSpHost<T, TId>,
  params: { id: TId; opts?: { expectedUpdated?: string } },
): Promise<boolean> {
  const { id, opts } = params;
  if (host.useOptimisticConcurrency && opts?.expectedUpdated !== undefined) {
    const affected = await host.spClient!.invokeReturningAffected(
      `delete_${host.entityName}_optimistic_concurrency`,
      [id, opts.expectedUpdated],
    );
    if (affected !== 1) {
      throw new PreconditionFailedError(
        `optimistic concurrency conflict on delete_${host.entityName}_optimistic_concurrency`,
      );
    }
    return true;
  }
  const affected = await host.spClient!.invokeReturningAffected(`delete_${host.entityName}`, [id]);
  return affected > 0;
}

export async function createViaSp<T, TId>(
  host: StandardSpHost<T, TId>,
  record: Record<string, unknown>,
  now: Date,
): Promise<T> {
  const uuid = (record['uuid'] as string | undefined) ?? randomUUID();
  const newId = await host.spClient!.invokeReturningId(`create_${host.entityName}`, [
    host.fieldConverter.applyTo('uuid', uuid),
    host.fieldConverter.applyTo('name', record['name'] ?? null),
    host.fieldConverter.applyTo('email', record['email'] ?? null),
    host.fieldConverter.applyTo('created', now),
    host.fieldConverter.applyTo('updated', now),
  ]);
  const row = await host.find(coerceSpReturnedId<TId>(host.idType, newId));
  if (!row) {
    throw new Error(`create_${host.entityName} returned id ${String(newId)} but no row was found`);
  }
  return row;
}

export async function updateViaSp<T, TId>(
  host: StandardSpHost<T, TId>,
  params: { id: TId; record: Record<string, unknown>; opts?: { expectedUpdated?: string } },
): Promise<T | null> {
  const { id, record, opts } = params;
  const now = new Date();
  const current = (await host.find(id)) as Record<string, unknown> | null;
  if (!current) return null;
  const merge = (key: string): unknown =>
    key in record && record[key] !== undefined ? record[key] : (current[key] ?? null);
  const boundName = host.fieldConverter.applyTo('name', merge('name'));
  const boundEmail = host.fieldConverter.applyTo('email', merge('email'));
  const boundUpdated = host.fieldConverter.applyTo('updated', now);

  if (host.useOptimisticConcurrency && opts?.expectedUpdated !== undefined) {
    const affected = await host.spClient!.invokeReturningAffected(
      `update_${host.entityName}_optimistic_concurrency`,
      [id, opts.expectedUpdated, boundName, boundEmail, boundUpdated],
    );
    if (affected !== 1) {
      throw new PreconditionFailedError(
        `optimistic concurrency conflict on update_${host.entityName}_optimistic_concurrency`,
      );
    }
    return host.find(id);
  }

  const affected = await host.spClient!.invokeReturningAffected(`update_${host.entityName}`, [
    id,
    boundName,
    boundEmail,
    boundUpdated,
  ]);
  if (affected === 0) return null;
  return host.find(id);
}
