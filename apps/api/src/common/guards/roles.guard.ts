import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException(`Requires role: ${required.join(', ')}`);
    }

    const hasRole = required.includes(user.role) || (
      user.role === Role.MANAGER && required.includes(Role.RECEPTIONIST)
    );

    if (!hasRole) {
      throw new ForbiddenException(`Requires role: ${required.join(', ')}`);
    }
    return true;
  }
}
