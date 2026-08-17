/** Result returned by {@link IAuthorizationService.canAccessPermission}. */
export interface CanAccessPermissionResult {
  /** `true` when the caller may proceed. */
  granted: boolean;
  /** Human-readable reason on failure. Surfaced to the client. */
  reason?: string;
  /** HTTP status to use on failure. Defaults to `403` when omitted. */
  statusCode?: number;
}

/**
 * Contract implemented by anything that can decide whether a token is allowed
 * to exercise a given permission. Consumed by the {@link authorizeRequest}
 * middleware, which derives the permission string from the HTTP request via
 * {@link derivePermission}.
 */
export interface IAuthorizationService {
  /**
   * @param token      Bearer token from the `Authorization` header.
   * @param permission Permission string such as `"read:project"`.
   */
  canAccessPermission(token: string, permission: string): Promise<CanAccessPermissionResult>;
}
