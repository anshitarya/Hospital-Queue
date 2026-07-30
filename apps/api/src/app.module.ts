import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { PatientsModule } from './modules/patients/patients.module';
import { QueueModule } from './modules/queue/queue.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { SignupRequestsModule } from './modules/signup-requests/signup-requests.module';
import { HealthModule } from './modules/health/health.module';
import { BusinessSettingsModule } from './modules/business-settings/business-settings.module';
import { ProfessionalScheduleModule } from './modules/professional-schedule/professional-schedule.module';
import { LeaveManagementModule } from './modules/leave-management/leave-management.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { BillingModule } from './modules/billing/billing.module';
import { BullModule } from '@nestjs/bullmq';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    BullModule.forRoot({
      connection: {
        url: (process.env.REDIS_URL ?? 'redis://localhost:6379').trim(),
      },
    }),
    CacheModule.register({ isGlobal: true, ttl: 60000 }), // 60 seconds global cache TTL
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    ClinicsModule,
    SignupRequestsModule,
    DepartmentsModule,
    DoctorsModule,
    PatientsModule,
    QueueModule,
    NotificationsModule,
    HealthModule,
    BusinessSettingsModule,
    ProfessionalScheduleModule,
    LeaveManagementModule,
    AnalyticsModule,
    WorkflowModule,
    RatingsModule,
    BillingModule,
    PrescriptionsModule,
  ],
  providers: [
    // Global request logger — runs around every HTTP handler.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },

    // Guards execute in registration order.
    // 1. JWT — populates req.user (skips @Public routes)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 2. Roles — checks req.user.role against @Roles(...)
    { provide: APP_GUARD, useClass: RolesGuard },
    // 3. Rate limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
