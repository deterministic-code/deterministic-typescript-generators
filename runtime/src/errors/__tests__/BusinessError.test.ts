import { BusinessError } from '../BusinessError';

describe('BusinessError', () => {
  it('should be an instance of Error', () => {
    const error = new BusinessError(400, 'bad request');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of BusinessError', () => {
    const error = new BusinessError(400, 'bad request');
    expect(error).toBeInstanceOf(BusinessError);
  });

  it('should store the statusCode', () => {
    const error = new BusinessError(409, 'conflict');
    expect(error.statusCode).toBe(409);
  });

  it('should store the message', () => {
    const error = new BusinessError(404, 'not found');
    expect(error.message).toBe('not found');
  });

  it('should set the name to BusinessError', () => {
    const error = new BusinessError(500, 'internal');
    expect(error.name).toBe('BusinessError');
  });

  it('should have a proper stack trace', () => {
    const error = new BusinessError(400, 'test');
    expect(error.stack).toBeDefined();
  });

  it('should work with 409 Conflict for duplicate username', () => {
    const error = new BusinessError(409, 'Username already exists');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Username already exists');
  });

  it('should work with 404 Not Found for missing user', () => {
    const error = new BusinessError(404, 'User not found');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('User not found');
  });

  it('should default code to undefined when not provided', () => {
    const error = new BusinessError(400, 'bad request');
    expect(error.code).toBeUndefined();
  });

  it('should store the optional code', () => {
    const error = new BusinessError(400, 'bad request', 'invalid_request');
    expect(error.code).toBe('invalid_request');
  });
});
