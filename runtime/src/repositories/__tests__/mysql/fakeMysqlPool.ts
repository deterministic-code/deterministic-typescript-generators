import Database from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';

function translateMysqlSyntax(sql: string): string {
  return (
    sql
      .replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT')
      .replace(/\bVARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/\bTIMESTAMP\b/gi, 'TEXT')
      .replace(/\bON UPDATE CURRENT_TIMESTAMP\b/gi, '')
      .replace(/\bDEFAULT CURRENT_TIMESTAMP\b/gi, 'DEFAULT (CURRENT_TIMESTAMP)')
      // MysqlSetup now writes `INSERT IGNORE INTO schema_migrations` for
      // idempotent re-runs; SQLite's equivalent is `INSERT OR IGNORE`.
      .replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO')
  );
}

export class FakeMysqlPool {
  readonly db: Database.Database;
  ended = false;
  private readonly recorded: string[] = [];

  constructor() {
    this.db = new Database(':memory:');
  }

  queriesExecuted(): string[] {
    return [...this.recorded];
  }

  async query(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
    this.recorded.push(sql);
    // SQLite can't execute MySQL DDL like CREATE PROCEDURE / TRIGGER / FUNCTION.
    // Record the call (so tests can verify the runner sent it as one atomic
    // statement) and short-circuit before sqlite chokes on the syntax.
    if (
      /^\s*CREATE\s+(OR\s+REPLACE\s+|OR\s+ALTER\s+)?(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i.test(sql)
    ) {
      return [{ affectedRows: 0, insertId: 0 }, undefined];
    }
    if (/^\s*DROP\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i.test(sql)) {
      return [{ affectedRows: 0, insertId: 0 }, undefined];
    }
    const translated = translateMysqlSyntax(sql);
    const stmt = this.db.prepare(translated);
    const args = (params ?? []) as unknown[];
    if (stmt.reader) {
      return [stmt.all(...args), undefined];
    }
    const result = stmt.run(...args);
    return [{ affectedRows: result.changes, insertId: Number(result.lastInsertRowid) }, undefined];
  }

  async execute(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
    return this.query(sql, params);
  }

  async end(): Promise<void> {
    if (!this.ended) {
      this.db.close();
      this.ended = true;
    }
  }

  asPool(): Pool {
    return this as unknown as Pool;
  }
}
