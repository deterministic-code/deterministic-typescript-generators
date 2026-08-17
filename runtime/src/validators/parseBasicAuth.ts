import { BusinessError } from '../errors/BusinessError';

/** Parsed result of an OAuth Basic `Authorization` header. */
export interface BasicAuthCredentials {
  client_id: string;
  client_secret: string;
}

/**
 * Parses an HTTP Basic `Authorization` header used for OAuth client
 * authentication. Returns `undefined` when the header is missing or does not
 * start with `"Basic "` (so the caller can fall back to another scheme).
 *
 * Throws a {@link BusinessError} with status **401** when the header is
 * present but malformed:
 *
 * - non-base64 payload               → `"Invalid Basic authorization header encoding"`
 * - decoded payload has no `:`        → `"Invalid Basic authorization header format"`
 * - empty client id                   → `"Basic authorization header missing client_id"`
 *
 * @param header Raw `Authorization` header value.
 */
export function parseBasicAuth(header: string | undefined): BasicAuthCredentials | undefined {
  if (!header || !header.startsWith('Basic ')) {
    return undefined;
  }

  const encoded = header.slice(6);

  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(encoded)) {
    throw new BusinessError(401, 'Invalid Basic authorization header encoding');
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    throw new BusinessError(401, 'Invalid Basic authorization header format');
  }

  const clientId = decoded.slice(0, colonIndex);
  if (!clientId) {
    throw new BusinessError(401, 'Basic authorization header missing client_id');
  }

  const clientSecret = decoded.slice(colonIndex + 1);

  return { client_id: clientId, client_secret: clientSecret };
}
