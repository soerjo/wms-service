import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { AuthUser } from '../interfaces/auth-user.interface.js';

interface RequestWithUser {
  user?: AuthUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      return false;
    }

    const userRoles: string[] = [];
    if (user.role) {
      userRoles.push(user.role);
    }
    if (Array.isArray(user.roles)) {
      userRoles.push(...user.roles);
    }

    const hasTokenRole = requiredRoles.some((role) => userRoles.includes(role));
    if (hasTokenRole) {
      return true;
    }

    if (this.prisma && user.id) {
      try {
        const userData = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });

        if (userData?.role && requiredRoles.includes(userData.role)) {
          return true;
        }
      } catch {
        // Fallback silently if DB lookup encounters an issue
      }
    }

    return false;
  }
}
