import { classifyConstraintError } from '../classifyConstraintError';

describe('classifyConstraintError', () => {
  describe('sqlite (better-sqlite3 err.code)', () => {
    it('maps SQLITE_CONSTRAINT_UNIQUE → 409 CONFLICT', () => {
      expect(classifyConstraintError({ code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'x' })).toEqual({
        status: 409,
        code: 'CONFLICT',
        message: 'x',
      });
    });

    it('maps SQLITE_CONSTRAINT_FOREIGNKEY → 400 FOREIGN_KEY', () => {
      expect(
        classifyConstraintError({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY', message: 'x' }),
      ).toEqual({ status: 400, code: 'FOREIGN_KEY', message: 'x' });
    });

    it('maps other SQLITE_CONSTRAINT_* → 400 VALIDATION_ERROR', () => {
      expect(classifyConstraintError({ code: 'SQLITE_CONSTRAINT_NOTNULL', message: 'x' })).toEqual({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'x',
      });
    });

    it('falls back to the sqlite message wording when the code is stripped', () => {
      expect(classifyConstraintError(new Error('FOREIGN KEY constraint failed'))).toEqual({
        status: 400,
        code: 'FOREIGN_KEY',
        message: 'FOREIGN KEY constraint failed',
      });
    });
  });

  describe('postgres (pg SQLSTATE err.code)', () => {
    it('maps 23505 (unique_violation) → 409 CONFLICT', () => {
      expect(classifyConstraintError({ code: '23505', message: 'dup' })).toEqual({
        status: 409,
        code: 'CONFLICT',
        message: 'dup',
      });
    });

    it('maps 23503 (foreign_key_violation) → 400 FOREIGN_KEY', () => {
      expect(classifyConstraintError({ code: '23503', message: 'fk' })).toEqual({
        status: 400,
        code: 'FOREIGN_KEY',
        message: 'fk',
      });
    });

    it('maps 23502 (not_null_violation) → 400 VALIDATION_ERROR', () => {
      expect(classifyConstraintError({ code: '23502', message: 'nn' })).toEqual({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'nn',
      });
    });
  });

  describe('mysql (mysql2 err.errno)', () => {
    it('maps errno 1062 (ER_DUP_ENTRY) → 409 CONFLICT', () => {
      expect(
        classifyConstraintError({ errno: 1062, code: 'ER_DUP_ENTRY', message: 'dup' }),
      ).toEqual({
        status: 409,
        code: 'CONFLICT',
        message: 'dup',
      });
    });

    it('maps errno 1452/1451 (FK) → 400 FOREIGN_KEY', () => {
      expect(classifyConstraintError({ errno: 1452, message: 'fk' })).toMatchObject({
        code: 'FOREIGN_KEY',
        status: 400,
      });
      expect(classifyConstraintError({ errno: 1451, message: 'fk' })).toMatchObject({
        code: 'FOREIGN_KEY',
        status: 400,
      });
    });

    it('maps errno 1048 (ER_BAD_NULL_ERROR) → 400 VALIDATION_ERROR', () => {
      expect(classifyConstraintError({ errno: 1048, message: 'nn' })).toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    });
  });

  describe('non-constraint errors', () => {
    it('returns null for an unrelated Error', () => {
      expect(classifyConstraintError(new Error('boom'))).toBeNull();
    });

    it('returns null for a non-object', () => {
      expect(classifyConstraintError('nope')).toBeNull();
    });

    it('returns null for an unknown numeric errno', () => {
      expect(classifyConstraintError({ errno: 9999, message: 'x' })).toBeNull();
    });
  });
});
