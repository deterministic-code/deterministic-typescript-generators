export interface ConstraintClassification {
  status: number;
  code: string;
  message: string;
}

const DEFAULT_MESSAGE: Record<string, string> = {
  CONFLICT: 'unique constraint violation',
  FOREIGN_KEY: 'foreign key constraint violation',
  VALIDATION_ERROR: 'constraint violation',
};

function classified(status: number, code: string, rawMessage: string): ConstraintClassification {
  return { status, code, message: rawMessage || DEFAULT_MESSAGE[code] };
}

function bySqliteCode(code: string, raw: string): ConstraintClassification | null {
  if (!code.startsWith('SQLITE_CONSTRAINT')) return null;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return classified(409, 'CONFLICT', raw);
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return classified(400, 'FOREIGN_KEY', raw);
  return classified(400, 'VALIDATION_ERROR', raw);
}

function byPostgresSqlState(code: string, raw: string): ConstraintClassification | null {
  if (!code.startsWith('23')) return null;
  if (code === '23505') return classified(409, 'CONFLICT', raw);
  if (code === '23503') return classified(400, 'FOREIGN_KEY', raw);
  return classified(400, 'VALIDATION_ERROR', raw);
}

function byMysqlErrno(errno: number, raw: string): ConstraintClassification | null {
  if (errno === 1062) return classified(409, 'CONFLICT', raw);
  if (errno === 1451 || errno === 1452) return classified(400, 'FOREIGN_KEY', raw);
  if (errno === 1048) return classified(400, 'VALIDATION_ERROR', raw);
  return null;
}

// Re-wrapped sqlite errors can arrive as a plain Error with only the message (driver `code` stripped).
function bySqliteMessage(raw: string): ConstraintClassification | null {
  if (raw.includes('UNIQUE constraint failed')) return classified(409, 'CONFLICT', raw);
  if (raw.includes('FOREIGN KEY constraint failed')) return classified(400, 'FOREIGN_KEY', raw);
  if (raw.includes('NOT NULL constraint failed')) return classified(400, 'VALIDATION_ERROR', raw);
  return null;
}

/**
 * Classifies a database driver's constraint-violation error into the standard
 * `{ status, code }` the API envelope uses, across all three SQL drivers:
 *
 * - better-sqlite3 → `err.code` = `SQLITE_CONSTRAINT_*`
 * - pg (postgres)  → `err.code` = SQLSTATE (`23505` unique, `23503` FK, `23502` not-null, …)
 * - mysql2         → `err.errno` (SQLSTATE `23000` can't split unique vs FK, so key on errno)
 *
 * Returns `null` when the error is not a recognized constraint violation so the
 * caller can fall through to its generic handling. Mirrors the Rust runtime's
 * `From<sqlx::Error>` mapping in `rust/src/middleware/error_handler.rs`.
 */
export function classifyConstraintError(err: unknown): ConstraintClassification | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: unknown; errno?: unknown; message?: unknown };
  const raw = typeof e.message === 'string' ? e.message : '';

  if (typeof e.code === 'string') {
    const byCode = bySqliteCode(e.code, raw) ?? byPostgresSqlState(e.code, raw);
    if (byCode) return byCode;
  }
  if (typeof e.errno === 'number') {
    const byErrno = byMysqlErrno(e.errno, raw);
    if (byErrno) return byErrno;
  }
  return bySqliteMessage(raw);
}
