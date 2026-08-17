import Database from 'better-sqlite3';

function translateSqlserverSyntax(sql: string): string {
  let s = sql;
  s = s.replace(
    /IF\s+NOT\s+EXISTS\s*\(\s*SELECT[\s\S]*?FROM\s+sys\.tables\s+WHERE\s+name\s*=\s*'([^']+)'\s*\)\s*CREATE\s+TABLE\s+\1\b/gi,
    'CREATE TABLE IF NOT EXISTS $1',
  );
  s = s.replace(/\bSYSUTCDATETIME\(\)/gi, 'CURRENT_TIMESTAMP');
  s = s.replace(/\bDATETIME2\b/gi, 'TEXT');
  s = s.replace(/\bNVARCHAR\(\d+\)/gi, 'TEXT');
  s = s.replace(/\bIDENTITY\(\d+,\s*\d+\)/gi, 'AUTOINCREMENT');
  s = s.replace(/\bOUTPUT\s+INSERTED\.\*/gi, '__INSERTED_RETURNING__');
  s = s.replace(/\bOUTPUT\s+DELETED\.\[?id\]?/gi, '__DELETED_RETURNING__');
  return s;
}

function liftReturning(translated: string): string {
  if (translated.includes('__INSERTED_RETURNING__')) {
    if (/^\s*INSERT\b/i.test(translated)) {
      const noMarker = translated.replace(/__INSERTED_RETURNING__\s*/, '');
      return `${noMarker} RETURNING *`;
    }
    if (/^\s*UPDATE\b/i.test(translated)) {
      const noMarker = translated.replace(/__INSERTED_RETURNING__\s*/, '');
      return `${noMarker} RETURNING *`;
    }
  }
  if (translated.includes('__DELETED_RETURNING__')) {
    const noMarker = translated.replace(/__DELETED_RETURNING__\s*/, '');
    return `${noMarker} RETURNING "id"`;
  }
  return translated;
}

interface FakeRequest {
  inputs: Record<string, unknown>;
  input(name: string, value: unknown): FakeRequest;
  query<R = unknown>(text: string): Promise<{ recordset: R[]; rowsAffected: number[] }>;
}

export class FakeMssqlPool {
  readonly db: Database.Database;
  ended = false;

  constructor() {
    this.db = new Database(':memory:');
  }

  async connect(): Promise<this> {
    return this;
  }

  request(): FakeRequest {
    const inputs: Record<string, unknown> = {};
    const self = this;
    const req: FakeRequest = {
      inputs,
      input(name, value) {
        inputs[name] = value;
        return req;
      },
      async query<R>(text: string) {
        let translated = liftReturning(translateSqlserverSyntax(text));
        const args: unknown[] = [];
        translated = translated.replace(/@p(\d+)/g, (_m, idxStr) => {
          const idx = Number(idxStr);
          args.push(inputs[`p${idx}`]);
          return '?';
        });
        const stmt = self.db.prepare(translated);
        if (stmt.reader) {
          const recordset = stmt.all(...args) as R[];
          return { recordset, rowsAffected: [recordset.length] };
        }
        const result = stmt.run(...args);
        return { recordset: [] as R[], rowsAffected: [result.changes] };
      },
    };
    return req;
  }

  async close(): Promise<void> {
    if (!this.ended) {
      this.db.close();
      this.ended = true;
    }
  }
}
