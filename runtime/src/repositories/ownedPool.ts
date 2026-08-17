export interface ResolvedPool<P> {
  pool: P | null;
  poolFactory: () => Promise<P>;
  ownsPool: boolean;
}

// An injected pool is borrowed (never closed here); otherwise the datasource owns the lazily-created one.
export function resolveOwnedPool<P>(
  injected: P | undefined,
  create: () => Promise<P>,
): ResolvedPool<P> {
  if (injected) {
    return { pool: injected, poolFactory: async () => injected, ownsPool: false };
  }
  return { pool: null, poolFactory: create, ownsPool: true };
}
