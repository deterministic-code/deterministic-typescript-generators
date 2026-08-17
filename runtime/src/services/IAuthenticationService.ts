import { UserInfoResult } from './ISigninService';

/**
 * Contract implemented by anything that can turn an access token into a
 * {@link UserInfoResult}. Consumed by the {@link authenticateRequest}
 * middleware. See {@link AuthenticationService} for the default adapter
 * over an {@link ISigninService}.
 */
export interface IAuthenticationService {
  /**
   * @param accessToken Bearer token from the `Authorization` header.
   * @returns The decoded user info.
   * @throws Typically a {@link BusinessError} with status 401 on failure.
   */
  authenticate(accessToken: string): Promise<UserInfoResult>;
}
