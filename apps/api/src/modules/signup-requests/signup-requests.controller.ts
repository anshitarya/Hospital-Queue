import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role, SignupRequestStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SignupRequestsService } from './signup-requests.service';
import { CreateSignupRequestDto } from './dto/create-signup-request.dto';
import { UpdateSignupRequestDto } from './dto/update-signup-request.dto';
import { ApproveSignupRequestDto } from './dto/approve-signup-request.dto';

@Controller('signup-requests')
export class SignupRequestsController {
  constructor(private readonly signupRequests: SignupRequestsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  submit(@Body() dto: CreateSignupRequestDto) {
    return this.signupRequests.create(dto);
  }

  @Roles(Role.ADMIN)
  @Get()
  list(@Query('status') status?: SignupRequestStatus) {
    return this.signupRequests.list(status);
  }

  @Roles(Role.ADMIN)
  @Get('stats/pending-count')
  pendingCount() {
    return this.signupRequests.pendingCount();
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.signupRequests.get(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSignupRequestDto) {
    return this.signupRequests.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveSignupRequestDto) {
    return this.signupRequests.approve(id, dto);
  }
}
