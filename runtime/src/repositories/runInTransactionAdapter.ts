import type { IDatasource } from './IDatasource';

export interface TxnPrimitives<C> {
  acquireConnection: () => Promise<C>;
  beginOnConnection: (conn: C) => Promise<void>;
  commitOnConnection: (conn: C) => Promise<void>;
  rollbackOnConnection: (conn: C) => Promise<void>;
  releaseConnection: (conn: C) => Promise<void>;
  makeTxnDatasource: (conn: C) => IDatasource;
}

export async function runInTransactionAdapter<C, R>(
  primitives: TxnPrimitives<C>,
  fn: (txn: IDatasource) => Promise<R>,
): Promise<R> {
  const conn = await primitives.acquireConnection();

  try {
    await primitives.beginOnConnection(conn);
  } catch (beginError) {
    await primitives.releaseConnection(conn);
    throw beginError;
  }

  const txnDs = primitives.makeTxnDatasource(conn);
  let fnResult: R | undefined;
  let fnErrorThrown = false;
  let fnError: Error | null = null;

  try {
    fnResult = await fn(txnDs);
  } catch (e) {
    fnErrorThrown = true;
    fnError = e instanceof Error ? e : new Error(String(e));
  }

  if (!fnErrorThrown) {
    let commitError: Error | null = null;
    try {
      await primitives.commitOnConnection(conn);
    } catch (e) {
      commitError = e instanceof Error ? e : new Error(String(e));
    }

    try {
      await primitives.releaseConnection(conn);
    } catch (releaseError) {
      if (commitError) {
        console.error('Error during release:', releaseError);
      } else {
        throw releaseError;
      }
    }

    if (commitError) {
      throw commitError;
    }

    return fnResult!;
  }

  try {
    await primitives.rollbackOnConnection(conn);
  } catch (rollbackError) {
    console.error('Error during rollback:', rollbackError);
  }

  try {
    await primitives.releaseConnection(conn);
  } catch (releaseError) {
    console.error('Error during release:', releaseError);
  }

  throw fnError!;
}
