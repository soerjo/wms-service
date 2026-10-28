import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { AuthUser } from '../interfaces/auth-user.interface.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const createMockContext = (
    user?: Partial<AuthUser>,
    handler = () => {},
    classRef = class {},
  ): ExecutionContext => {
    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({
          user: user as AuthUser,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    guard = new RolesGuard(reflector, prisma as unknown as PrismaService);
  });

  it('allows access if route is marked as @Public() even with required roles', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    const context = createMockContext();
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows access if no roles are required', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return undefined;
      return undefined;
    });

    const context = createMockContext();
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies access if user is missing in request', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    const context = createMockContext(undefined);
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows access if required role exists in token user.roles (without querying DB)', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    const context = createMockContext({
      id: 'ums-user-123',
      role: 'USER',
      roles: ['STAFF', 'ADMIN'],
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows access if required role exists in user.role', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    const context = createMockContext({
      id: 'local-user-456',
      role: 'ADMIN',
      roles: [],
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to DB lookup and allows access if role is found in database', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const context = createMockContext({
      id: 'db-user-789',
      role: 'USER',
      roles: ['USER'],
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'db-user-789' },
      select: { role: true },
    });
  });

  it('denies access if role matches neither token nor DB record', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    prisma.user.findUnique.mockResolvedValue({ role: 'STAFF' });

    const context = createMockContext({
      id: 'user-unauthorized',
      role: 'USER',
      roles: ['USER'],
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(false);
  });

  it('denies access gracefully when DB lookup throws an error', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['ADMIN'];
      return undefined;
    });

    prisma.user.findUnique.mockRejectedValue(
      new Error('DB Connection Timeout'),
    );

    const context = createMockContext({
      id: 'user-err',
      role: 'USER',
      roles: ['USER'],
    });

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(false);
  });
});
