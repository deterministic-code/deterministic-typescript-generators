/**
 * Result returned to callers signing in to the built-in first-party app.
 * The client gets a token pair back directly and is told to navigate to `/`.
 */
export interface BuiltinAppAuthResult {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  redirect_uri: '/';
}

/**
 * Result returned when the signin is part of an OAuth 2.0 authorization-code
 * flow initiated by an external client. The caller must redirect the user
 * back to `redirect_uri` with `authorization_code` appended.
 */
export interface ExternalAppAuthResult {
  authorization_code: string;
  redirect_uri: string;
}

/**
 * Discriminated union returned by {@link ISigninService.signin}.
 * Inspect the payload's shape to branch between the built-in and external
 * (OAuth) outcomes.
 */
export type AuthCallbackResult = BuiltinAppAuthResult | ExternalAppAuthResult;
