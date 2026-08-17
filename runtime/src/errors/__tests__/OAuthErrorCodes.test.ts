import { OAuthErrorCodes } from '../OAuthErrorCodes';

const CODES = [
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
] as const;

describe('OAuthErrorCodes', () => {
  it.each(CODES)('exposes %s as a self-named code', (code) => {
    expect(OAuthErrorCodes[code]).toBe(code);
  });

  it('should provide descriptions for each code', () => {
    expect(OAuthErrorCodes.description('invalid_request')).toBe(
      'A required parameter is missing or invalid.',
    );
    expect(OAuthErrorCodes.description('unauthorized_client')).toBe(
      'The client is not authorized to use the requested method.',
    );
    expect(OAuthErrorCodes.description('access_denied')).toBe(
      'The user or authorization server denied the request.',
    );
    expect(OAuthErrorCodes.description('unsupported_response_type')).toBe(
      'The server does not support the requested response type.',
    );
    expect(OAuthErrorCodes.description('invalid_scope')).toBe('The requested scope is invalid.');
    expect(OAuthErrorCodes.description('server_error')).toBe(
      'The server encountered an unexpected error.',
    );
    expect(OAuthErrorCodes.description('temporarily_unavailable')).toBe(
      'The server is temporarily down for maintenance.',
    );
  });
});
