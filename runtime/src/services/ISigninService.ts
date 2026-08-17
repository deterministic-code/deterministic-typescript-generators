import { SigninSessionInfo } from '../middleware/authenticateSignin';
import { AuthCallbackResult } from './AuthCallbackResult';

/** Credentials passed to {@link ISigninService.signin}. */
export interface SigninParams {
  /** End-user identifier (e.g., email or username). */
  username: string;
  /** Password, TOTP code, or other secret — service decides what's valid. */
  secret: string;
  /** Identifier for the authentication scheme the service should use. */
  authentication_method: string;
  /** OAuth client id when the flow is initiated by an external app. */
  client_id?: string;
}

/**
 * Decoded access-token payload returned by
 * {@link ISigninService.validateToken} and attached to `req.user` by
 * {@link authenticateRequest}.
 */
export interface UserInfoResult {
  user_id: number;
  username: string;
  roles: string[];
  scopes: string[];
  /** `iat` JWT claim — seconds since epoch. */
  iat: number;
  /** `exp` JWT claim — seconds since epoch. */
  exp: number;
}

/**
 * Implementations handle both the signin flow (exchange credentials for a
 * token / authorization code) and access-token validation. Consumed by
 * {@link AuthenticationService} and, indirectly, by
 * {@link authenticateRequest}.
 */
export interface ISigninService {
  /**
   * Exchanges `params` for a token or authorization code. When the call is
   * part of a multi-step signin the caller forwards the current
   * {@link SigninSessionInfo} so the service can track progress.
   */
  signin(params: SigninParams, signinSession?: SigninSessionInfo): Promise<AuthCallbackResult>;
  /**
   * Decodes and validates an access token.
   * @throws A {@link BusinessError} with status 401 when the token is
   *         missing, malformed, or expired.
   */
  validateToken(token: string): Promise<UserInfoResult>;
}
