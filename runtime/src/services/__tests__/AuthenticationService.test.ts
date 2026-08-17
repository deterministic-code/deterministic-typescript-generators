import { AuthenticationService } from '../AuthenticationService';
import { ISigninService, UserInfoResult } from '../ISigninService';
import { BusinessError } from '../../errors/BusinessError';

function createMockSigninService(): jest.Mocked<ISigninService> {
  return {
    signin: jest.fn(),
    validateToken: jest.fn(),
  };
}

describe('AuthenticationService', () => {
  let signinService: jest.Mocked<ISigninService>;
  let authenticationService: AuthenticationService;

  beforeEach(() => {
    signinService = createMockSigninService();
    authenticationService = new AuthenticationService(signinService);
  });

  describe('authenticate', () => {
    it('should return UserInfoResult when token is valid', async () => {
      const expectedResult: UserInfoResult = {
        user_id: 1,
        username: 'testuser',

        roles: [],
        scopes: [],
        iat: 1000000,
        exp: 2000000,
      };

      signinService.validateToken.mockResolvedValue(expectedResult);

      const result = await authenticationService.authenticate('valid-token');

      expect(result).toEqual(expectedResult);
      expect(signinService.validateToken).toHaveBeenCalledWith('valid-token');
      expect(signinService.validateToken).toHaveBeenCalledTimes(1);
    });

    it('should throw BusinessError when token is invalid', async () => {
      signinService.validateToken.mockImplementation(() => {
        throw new BusinessError(401, 'Invalid or expired token');
      });

      await expect(authenticationService.authenticate('invalid-token')).rejects.toThrow(
        BusinessError,
      );

      await expect(authenticationService.authenticate('invalid-token')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid or expired token',
      });
    });

    it('should throw BusinessError when token is empty string', async () => {
      signinService.validateToken.mockImplementation(() => {
        throw new BusinessError(401, 'Invalid or expired token');
      });

      await expect(authenticationService.authenticate('')).rejects.toThrow(BusinessError);
    });

    it('should delegate to signinService.validateToken', async () => {
      const expectedResult: UserInfoResult = {
        user_id: 42,
        username: 'delegateuser',
        roles: [],
        scopes: [],
        iat: 1111111,
        exp: 2222222,
      };

      signinService.validateToken.mockResolvedValue(expectedResult);

      await authenticationService.authenticate('some-token');

      expect(signinService.validateToken).toHaveBeenCalledWith('some-token');
    });

    it('should propagate non-BusinessError exceptions', async () => {
      signinService.validateToken.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(authenticationService.authenticate('any-token')).rejects.toThrow(
        'Unexpected error',
      );
    });
  });
});
