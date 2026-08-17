import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataSourceConsoleLoggerMiddleware } from '../DataSourceConsoleLoggerMiddleware';

const TRACE = /^\[[^\]]+\]-\[datasource\]\[(Start|Finish|Error)\]-\[([^\]]+)\](?:\s+(.*))?$/;

describe('DataSourceConsoleLoggerMiddleware', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('beforeQuery emits a Start line with the full SQL statement', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();

    await mw.beforeQuery('sqlite', 'SELECT * FROM users WHERE id = ?', [1]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const m = TRACE.exec(line);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Start');
    expect(m![2]).toBe('SELECT * FROM users WHERE id = ?');
  });

  it('beforeQuery without params still emits the full SQL', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();

    await mw.beforeQuery('postgres', 'SELECT * FROM users');

    const m = TRACE.exec(logSpy.mock.calls[0][0] as string);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Start');
    expect(m![2]).toBe('SELECT * FROM users');
  });

  it('afterQuery emits a Finish line with full SQL and elapsed ms', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();

    await mw.afterQuery('mysql', 'SELECT * FROM users', [1], [{ id: 1 }, { id: 2 }], 42.5);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const m = TRACE.exec(line);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Finish');
    expect(m![2]).toBe('SELECT * FROM users');
    expect(m![3]).toMatch(/^43ms$/);
  });

  it('afterQuery for DELETE emits Finish carrying the DELETE statement', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();

    await mw.afterQuery('sqlserver', 'DELETE FROM users WHERE id = ?', [1], [], 15.0);

    const m = TRACE.exec(logSpy.mock.calls[0][0] as string);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Finish');
    expect(m![2]).toBe('DELETE FROM users WHERE id = ?');
  });

  it('afterQuery with error carries SQL plus the error message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mw = new DataSourceConsoleLoggerMiddleware();
    const err = new Error('connection refused');

    await mw.afterQuery('oracle', 'SELECT * FROM users', undefined, [], 25.3, err);

    const m = TRACE.exec(logSpy.mock.calls[0][0] as string);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Error');
    expect(m![2]).toBe('SELECT * FROM users');
    expect(m![3]).toMatch(/connection refused.*\d+ms/);
    errorSpy.mockRestore();
  });

  it('collapses multi-line SQL into a single line for the trace', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();
    await mw.beforeQuery(
      'sqlite',
      'INSERT INTO "contacts"\n  ("first_name", "last_name")\nVALUES (?, ?)',
    );

    const m = TRACE.exec(logSpy.mock.calls[0][0] as string);
    expect(m).not.toBeNull();
    expect(m![2]).toBe('INSERT INTO "contacts" ("first_name", "last_name") VALUES (?, ?)');
  });

  it('truncates extremely long SQL and signals truncation with an ellipsis', async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();
    const longSql = `SELECT ${Array.from({ length: 200 }, (_, i) => `"col_${i}"`).join(', ')} FROM "t"`;
    expect(longSql.length).toBeGreaterThan(1024);

    await mw.beforeQuery('sqlite', longSql);

    const line = logSpy.mock.calls[0][0] as string;
    const m = TRACE.exec(line);
    expect(m).not.toBeNull();
    expect(m![2].endsWith('…')).toBe(true);
    expect(m![2].length).toBeLessThanOrEqual(1024);
  });

  it("strips ']' from the SQL so it can't break the trace's bracket boundary", async () => {
    const mw = new DataSourceConsoleLoggerMiddleware();
    await mw.beforeQuery('sqlserver', 'SELECT * FROM [dbo].[users]');

    const line = logSpy.mock.calls[0][0] as string;
    const m = TRACE.exec(line);
    expect(m).not.toBeNull();
    expect(m![2]).toBe('SELECT * FROM [dbo).[users)');
  });
});
