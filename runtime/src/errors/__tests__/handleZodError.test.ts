import { ZodError, ZodIssue } from 'zod';
import { handleZodError } from '../handleZodError';
import { createMockResponse } from './mockResponse';

function createZodError(issues: Partial<ZodIssue>[]): ZodError {
  const fullIssues = issues.map((issue) => ({
    code: 'custom' as const,
    path: issue.path ?? [],
    message: issue.message ?? 'Invalid',
    ...issue,
  }));
  return new ZodError(fullIssues as ZodIssue[]);
}

describe('handleZodError', () => {
  it('should return true when error is a ZodError', () => {
    const res = createMockResponse();
    const err = createZodError([{ path: ['name'], message: 'Required' }]);

    const result = handleZodError(err, res);

    expect(result).toBe(true);
  });

  it('should return false when error is not a ZodError', () => {
    const res = createMockResponse();
    const err = new Error('Something went wrong');

    const result = handleZodError(err, res);

    expect(result).toBe(false);
  });

  it('should return false when error is a string', () => {
    const res = createMockResponse();

    const result = handleZodError('not a zod error', res);

    expect(result).toBe(false);
  });

  it('should return false when error is null', () => {
    const res = createMockResponse();

    const result = handleZodError(null, res);

    expect(result).toBe(false);
  });

  it('should send 400 status with VALIDATION_ERROR code', () => {
    const res = createMockResponse();
    const err = createZodError([{ path: ['name'], message: 'Required' }]);

    handleZodError(err, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      errors: [
        {
          code: 'VALIDATION_ERROR',
          message: 'name: Required',
        },
      ],
    });
  });

  it('should join multiple errors with semicolons', () => {
    const res = createMockResponse();
    const err = createZodError([
      { path: ['name'], message: 'Required' },
      { path: ['email'], message: 'Invalid email' },
    ]);

    handleZodError(err, res);

    expect(res.json).toHaveBeenCalledWith({
      errors: [
        {
          code: 'VALIDATION_ERROR',
          message: 'name: Required; email: Invalid email',
        },
      ],
    });
  });

  it('should join nested paths with dots', () => {
    const res = createMockResponse();
    const err = createZodError([{ path: ['address', 'city'], message: 'Required' }]);

    handleZodError(err, res);

    expect(res.json).toHaveBeenCalledWith({
      errors: [
        {
          code: 'VALIDATION_ERROR',
          message: 'address.city: Required',
        },
      ],
    });
  });

  it('should not call res.status when error is not a ZodError', () => {
    const res = createMockResponse();
    const err = new Error('Something went wrong');

    handleZodError(err, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
