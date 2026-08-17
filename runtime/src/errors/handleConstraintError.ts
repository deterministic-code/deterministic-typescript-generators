import { Response } from 'express';
import { classifyConstraintError } from './classifyConstraintError';

/**
 * Detects a database constraint-violation error (sqlite, postgres, or mysql) and
 * converts it into a well-formed 4xx response:
 *   - UNIQUE      → 409 Conflict (CONFLICT)
 *   - FOREIGN KEY → 400 Bad Request (FOREIGN_KEY)
 *   - other       → 400 Bad Request (VALIDATION_ERROR)
 *
 * Dialect classification lives in {@link classifyConstraintError}; this shapes
 * the friendly message. Returns true when handled (a response was sent); false
 * otherwise (caller forwards to next(err)).
 */
export function handleConstraintError(err: unknown, res: Response): boolean {
  const classified = classifyConstraintError(err);
  if (!classified) return false;
  res.status(classified.status).json({
    errors: [
      { code: classified.code, message: friendlyMessage(classified.code, classified.message) },
    ],
  });
  return true;
}

function friendlyMessage(code: string, rawMessage: string): string {
  if (code === 'CONFLICT') {
    const match = rawMessage.match(/UNIQUE constraint failed:\s*\S+\.(\S+)/);
    if (match) return `${match[1]} already exists`;
    if (rawMessage.includes('UNIQUE constraint failed')) return 'unknown already exists';
    return 'unique constraint violated: a row with these values already exists';
  }
  if (code === 'FOREIGN_KEY') {
    return 'foreign key constraint violated: referenced row does not exist';
  }
  return rawMessage;
}
