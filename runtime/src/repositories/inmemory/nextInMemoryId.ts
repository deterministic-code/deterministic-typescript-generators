import { randomUUID } from 'node:crypto';

export type InMemoryIdType = 'integer' | 'biginteger' | 'uuid' | 'string';

/**
 * The next in-memory `id` for a row under this id_type, shared by both in-memory
 * repositories so id generation lives in one place: a caller-supplied or freshly
 * generated uuid, a bigint/integer drawn from the table's counter, or a required
 * caller-supplied string. Mirrors the SQL repositories, whose DDL owns the same
 * choice, so the memory backend a test drives isn't silently integer-only.
 */
export function nextInMemoryId(
  idType: InMemoryIdType,
  providedId: unknown,
  bumpCounter: () => number,
): number | bigint | string {
  switch (idType) {
    case 'uuid':
      return (providedId as string | undefined) ?? randomUUID();
    case 'biginteger':
      return BigInt(bumpCounter());
    case 'string':
      if (providedId === undefined) {
        throw new Error("Caller-supplied id required when idType='string'");
      }
      return providedId as string;
    default:
      return bumpCounter();
  }
}
