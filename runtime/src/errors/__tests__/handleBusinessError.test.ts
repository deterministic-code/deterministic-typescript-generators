import { handleBusinessError } from '../handleBusinessError';
import { BusinessError } from '../BusinessError';
import { createMockResponse } from './mockResponse';

describe('handleBusinessError', () => {
  it('returns true and sends error response for BusinessError', () => {
    const res = createMockResponse();
    const err = new BusinessError(400, "Application type 'Unknown' not found");

    const result = handleBusinessError(err, res);

    expect(result).toBe(true);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      errors: [
        {
          code: 'BUSINESS_ERROR',
          message: "Application type 'Unknown' not found",
        },
      ],
    });
  });

  it('returns false for non-BusinessError', () => {
    const res = createMockResponse();
    const err = new Error('Some other error');

    const result = handleBusinessError(err, res);

    expect(result).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns false for null/undefined', () => {
    const res = createMockResponse();

    expect(handleBusinessError(null, res)).toBe(false);
    expect(handleBusinessError(undefined, res)).toBe(false);
  });

  it('uses the correct status code from BusinessError', () => {
    const res = createMockResponse();
    const err = new BusinessError(422, 'Validation failed');

    handleBusinessError(err, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('emits err.code when set (parity with errorHandler middleware)', () => {
    const res = createMockResponse();
    const err = new BusinessError(401, 'Invalid or expired token', 'INVALID_TOKEN');

    handleBusinessError(err, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ code: 'INVALID_TOKEN', message: 'Invalid or expired token' }],
    });
  });

  it('falls back to BUSINESS_ERROR when err.code is undefined', () => {
    const res = createMockResponse();
    const err = new BusinessError(400, 'Bad thing');

    handleBusinessError(err, res);

    expect(res.json).toHaveBeenCalledWith({
      errors: [{ code: 'BUSINESS_ERROR', message: 'Bad thing' }],
    });
  });
});
