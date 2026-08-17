import { IAuthenticationService } from './IAuthenticationService';
import { ISigninService, UserInfoResult } from './ISigninService';

/**
 * Thin adapter that satisfies {@link IAuthenticationService} by delegating
 * `authenticate(token)` to an {@link ISigninService} `validateToken`. Wire
 * this into {@link authenticateRequest} so the middleware doesn't need to
 * know about the signin service directly.
 */
export class AuthenticationService implements IAuthenticationService {
  constructor(private readonly signinService: ISigninService) {}

  /**
   * Validates an access token and returns the decoded user info.
   * @throws Whatever the underlying `signinService.validateToken` throws
   *         (typically a {@link BusinessError} with status 401).
   */
  async authenticate(accessToken: string): Promise<UserInfoResult> {
    return this.signinService.validateToken(accessToken);
  }
}
