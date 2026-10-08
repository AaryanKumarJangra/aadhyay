import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Auth } from '@aadhyay/contracts';
import { AuthService } from './auth.service';
import { Public, NoTenant, TenantOptional, AllowSuspended } from './decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../context/request-context';
import { AppError } from '../../common/errors';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('otp/request')
  request(@Body(Z(Auth.otpRequest)) b: { phone: string }, @Req() req: FastifyRequest) {
    return this.auth.requestOtp(b.phone, req.ip);
  }

  @Public() @Post('otp/verify')
  verify(@Body(Z(Auth.otpVerify)) b: any, @Req() req: FastifyRequest) {
    return this.auth.verifyOtp({ ...b, ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('password/login')
  password(@Body(Z(Auth.passwordLogin)) b: any, @Req() req: FastifyRequest) {
    return this.auth.passwordLogin({ ...b, ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('refresh')
  refresh(@Body(Z(Auth.refreshBody)) b: { refreshToken: string }) {
    return this.auth.refresh(b.refreshToken);
  }

  @NoTenant() @AllowSuspended() @Post('logout')
  logout() {
    return this.auth.logout(Ctx.get().sessionId!);
  }

  @NoTenant() @AllowSuspended() @Post('switch-tenant')
  switch(@Body(Z(Auth.switchTenant)) b: { tenantId: string }) {
    const c = Ctx.get();
    return this.auth.switchTenant(c.userId!, c.sessionId!, b.tenantId);
  }

  @NoTenant() @Get('sessions')
  sessions() {
    return this.auth.sessions(Ctx.get().userId!);
  }

  @NoTenant() @Post('password')
  setPassword(@Body(Z(Auth.setPassword)) b: { password: string }) {
    return this.auth.setPassword(Ctx.get().userId!, b.password);
  }
  @NoTenant() @Post('totp/setup')
  totpSetup() {
    return this.auth.totpSetup(Ctx.get().userId!);
  }
  @NoTenant() @Post('totp/enable')
  totpEnable(@Body(Z(Auth.totpEnable)) b: { code: string }) {
    return this.auth.totpEnable(Ctx.get().userId!, b.code);
  }
}

@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}
  @TenantOptional() @AllowSuspended() @Get()
  async me() {
    const c = Ctx.get();
    if (!c.userId) throw new AppError('UNAUTHENTICATED', 'Login required');
    const memberships = await this.auth.memberships(c.userId);
    return {
      userId: c.userId,
      tenantId: c.tenantId ?? null,
      tenantStatus: c.tenantStatus ?? null,
      kinds: c.kinds ?? [],
      personIds: c.personIds ?? {},
      permissions: [...(c.permissions ?? [])],
      memberships,
    };
  }
}
