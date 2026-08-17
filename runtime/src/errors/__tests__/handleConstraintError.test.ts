import { handleConstraintError } from '../handleConstraintError';
import { createMockResponse } from './mockResponse';

function expectConstraintResponse(
  err: unknown,
  expected: { status: number; code: string; message: string },
): void {
  const res = createMockResponse();
  expect(handleConstraintError(err, res)).toBe(true);
  expect(res.status).toHaveBeenCalledWith(expected.status);
  expect(res.json).toHaveBeenCalledWith({
    errors: [{ code: expected.code, message: expected.message }],
  });
}

const FK_MESSAGE = 'foreign key constraint violated: referenced row does not exist';
const CONFLICT_MESSAGE = 'unique constraint violated: a row with these values already exists';

describe('handleConstraintError', () => {
  it('sends 409 CONFLICT with the offending field for a SQLite UNIQUE error', () => {
    expectConstraintResponse(new Error('UNIQUE constraint failed: applications.client_id'), {
      status: 409,
      code: 'CONFLICT',
      message: 'client_id already exists',
    });
  });

  it('extracts the field name from the constraint message', () => {
    expectConstraintResponse(new Error('UNIQUE constraint failed: applications.name'), {
      status: 409,
      code: 'CONFLICT',
      message: 'name already exists',
    });
  });

  it("falls back to 'unknown' when the message has no table.column segment", () => {
    expectConstraintResponse(new Error('UNIQUE constraint failed: bare_column'), {
      status: 409,
      code: 'CONFLICT',
      message: 'unknown already exists',
    });
  });

  it('sends 400 FOREIGN_KEY for a SQLite FOREIGN KEY error', () => {
    expectConstraintResponse(new Error('FOREIGN KEY constraint failed'), {
      status: 400,
      code: 'FOREIGN_KEY',
      message: FK_MESSAGE,
    });
  });

  it('sends 400 FOREIGN_KEY for a postgres foreign_key_violation (SQLSTATE 23503)', () => {
    const err = Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    expectConstraintResponse(err, { status: 400, code: 'FOREIGN_KEY', message: FK_MESSAGE });
  });

  it('sends 409 CONFLICT for a postgres unique_violation (SQLSTATE 23505)', () => {
    const err = Object.assign(new Error('duplicate key value'), { code: '23505' });
    expectConstraintResponse(err, { status: 409, code: 'CONFLICT', message: CONFLICT_MESSAGE });
  });

  it('sends 400 FOREIGN_KEY for a mysql FK violation (errno 1452)', () => {
    const err = Object.assign(new Error('Cannot add or update a child row'), {
      code: 'ER_NO_REFERENCED_ROW_2',
      errno: 1452,
    });
    expectConstraintResponse(err, { status: 400, code: 'FOREIGN_KEY', message: FK_MESSAGE });
  });

  it('sends 409 CONFLICT for a mysql duplicate entry (errno 1062)', () => {
    const err = Object.assign(new Error("Duplicate entry 'x' for key 'name'"), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    });
    expectConstraintResponse(err, { status: 409, code: 'CONFLICT', message: CONFLICT_MESSAGE });
  });

  it('returns false for non-constraint errors', () => {
    const res = createMockResponse();
    expect(handleConstraintError(new Error('Some other error'), res)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns false for non-Error objects', () => {
    const res = createMockResponse();
    expect(handleConstraintError('string error', res)).toBe(false);
  });
});
