import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RatingsService } from './ratings.service';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { serviceDay, serviceDaysAgo } from '../../common/utils/timezone';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Roles(Role.PATIENT)
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitRatingDto) {
    return this.ratings.submitRating(user.id, dto);
  }

  @Roles(Role.PATIENT)
  @Get('entry/:entryId')
  getForEntry(@CurrentUser() user: AuthUser, @Param('entryId') entryId: string) {
    return this.ratings.getRatingForEntry(entryId, user.id);
  }

  @Roles(Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.ADMIN)
  @Get('clinic')
  clinicReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    if (!user.clinicId) throw new ForbiddenException('No clinic assigned');
    const today = serviceDay();
    return this.ratings.getClinicRatingsReport(
      user.clinicId,
      from ?? serviceDaysAgo(29),
      to ?? today,
      search,
    );
  }
}
