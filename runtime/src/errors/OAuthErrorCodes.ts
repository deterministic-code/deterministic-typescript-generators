const DESCRIPTIONS: Record<string, string> = {
  invalid_request: 'A required parameter is missing or invalid.',
  unauthorized_client: 'The client is not authorized to use the requested method.',
  access_denied: 'The user or authorization server denied the request.',
  unsupported_response_type: 'The server does not support the requested response type.',
  invalid_scope: 'The requested scope is invalid.',
  server_error: 'The server encountered an unexpected error.',
  temporarily_unavailable: 'The server is temporarily down for maintenance.',
};

/**
 * String constants for the OAuth 2.0 `error` parameter (RFC 6749 §4.1.2.1),
 * plus a `description()` helper that returns the canonical human-readable
 * message for a code.
 *
 * @example
 * OAuthErrorCodes.invalid_scope; // → "invalid_scope"
 * OAuthErrorCodes.description("access_denied");
 * // → "The user or authorization server denied the request."
 */
export class OAuthErrorCodes {
  static readonly invalid_request = 'invalid_request';
  static readonly unauthorized_client = 'unauthorized_client';
  static readonly access_denied = 'access_denied';
  static readonly unsupported_response_type = 'unsupported_response_type';
  static readonly invalid_scope = 'invalid_scope';
  static readonly server_error = 'server_error';
  static readonly temporarily_unavailable = 'temporarily_unavailable';

  /**
   * @param code A value from this class (e.g. `OAuthErrorCodes.access_denied`).
   * @returns The canonical description, or `undefined` for an unknown code.
   */
  static description(code: string): string | undefined {
    return DESCRIPTIONS[code];
  }
}
