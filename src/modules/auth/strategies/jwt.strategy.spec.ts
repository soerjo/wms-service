import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy.js';
import { AuthService } from '../auth.service.js';
import { AuthUser } from '../../../common/interfaces/auth-user.interface.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: {
    validateUserById: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const dummyPublicKey =
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Y8+test\n-----END PUBLIC KEY-----';

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'UMS_JWT_PUBLIC_KEY') return dummyPublicKey;
        return undefined;
      }),
    };

    authService = {
      validateUserById: jest.fn(),
    };

    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      authService as unknown as AuthService,
    );
  });

  it('throws UnauthorizedException if payload.sub is missing', async () => {
    await expect(strategy.validate({ sub: '' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns enriched local user with roles and orgs from token payload', async () => {
    const mockLocalUser: AuthUser = {
      id: 'usr-123',
      email: 'local@wms.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'ADMIN',
      organizationId: 'org-default',
    };

    authService.validateUserById.mockResolvedValue(mockLocalUser);

    const result = await strategy.validate({
      sub: 'usr-123',
      email: 'token@wms.com',
      roles: ['ADMIN', 'MANAGER'],
      orgs: ['org-central'],
    });

    expect(result.id).toBe('usr-123');
    expect(result.roles).toEqual(['ADMIN', 'MANAGER']);
    expect(result.orgs).toEqual(['org-central']);
    expect(authService.validateUserById).toHaveBeenCalledWith('usr-123');
  });

  it('returns fallback AuthUser when local user is not found in database', async () => {
    authService.validateUserById.mockResolvedValue(null);

    const result = await strategy.validate({
      sub: 'ums-external-999',
      email: 'external@ums.com',
      roles: ['STAFF'],
      orgs: ['org-subsidiary'],
    });

    expect(result).toEqual({
      id: 'ums-external-999',
      email: 'external@ums.com',
      firstName: null,
      lastName: null,
      role: 'USER',
      organizationId: 'org-subsidiary',
      roles: ['STAFF'],
      orgs: ['org-subsidiary'],
    });
  });

  it('returns fallback AuthUser when validateUserById throws an error', async () => {
    authService.validateUserById.mockRejectedValue(
      new Error('DB Query Failed'),
    );

    const result = await strategy.validate({
      sub: 'ums-sub-888',
      email: 'user888@ums.com',
      roles: ['VIEWER'],
    });

    expect(result.id).toBe('ums-sub-888');
    expect(result.email).toBe('user888@ums.com');
    expect(result.role).toBe('USER');
    expect(result.roles).toEqual(['VIEWER']);
    expect(result.organizationId).toBe('');
  });
});
