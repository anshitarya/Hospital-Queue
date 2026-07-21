import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingGateway } from './billing.gateway';

@Injectable()
export class UsageEventService {
  private readonly logger = new Logger(UsageEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
  ) {}

  /**
   * Triggers a usage telemetry event idempotently, updates summaries,
   * and broadcasts real-time updates to admin screens.
   */
  async triggerEvent(
    eventType: string,
    data: {
      businessId: string;
      locationId: string;
      professionalId?: string | null;
      receptionistId?: string | null;
      customerId?: string | null;
      appointmentId?: string | null;
      queueId?: string | null;
      visitId?: string | null;
      referenceId?: string | null;
      metadata?: any;
    },
  ) {
    try {
      // 1. Determine Billing Status dynamically
      const billingStatus = await this.determineBillingStatus(data.businessId, eventType);

      // 2. Format database variables
      const professionalId = data.professionalId || 'SYSTEM';
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      const summaryDate = new Date(`${dateStr}T00:00:00Z`);

      // Use referenceId for idempotency to prevent duplicate logs if caller retries
      const referenceId = data.referenceId || `${data.queueId || 'ref'}_${eventType}_${timestamp.getTime()}`;

      // 3. Write event & increment summary atomically in a transaction
      const event = await this.prisma.$transaction(async (tx) => {
        // Check idempotency if referenceId is set
        if (data.referenceId) {
          const existing = await tx.usageEvent.findUnique({
            where: { referenceId: data.referenceId },
          });
          if (existing) {
            this.logger.debug(`Duplicate event skipped: ${data.referenceId}`);
            return existing;
          }
        }

        const createdEvent = await tx.usageEvent.create({
          data: {
            eventType,
            businessId: data.businessId,
            locationId: data.locationId,
            professionalId: data.professionalId || null,
            receptionistId: data.receptionistId || null,
            customerId: data.customerId || null,
            appointmentId: data.appointmentId || null,
            queueId: data.queueId || null,
            visitId: data.visitId || null,
            referenceId,
            timestamp,
            metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : {},
            billingStatus,
          },
        });

        // Atomic summary increment
        await tx.usageSummary.upsert({
          where: {
            businessId_locationId_professionalId_date_eventType: {
              businessId: data.businessId,
              locationId: data.locationId,
              professionalId,
              date: summaryDate,
              eventType,
            },
          },
          update: {
            count: { increment: 1 },
          },
          create: {
            businessId: data.businessId,
            locationId: data.locationId,
            professionalId,
            date: summaryDate,
            eventType,
            count: 1,
          },
        });

        return createdEvent;
      });

      // 4. Emit live socket update for real-time dashboards
      this.gateway.broadcastEvent({
        ...event,
        professionalId,
        summaryDate,
      });

      return event;
    } catch (error) {
      // Fail-safety: Never break critical business paths (e.g. login or booking) if tracking fails
      this.logger.error(`Failed to track usage event: ${eventType}`, error as Error);
    }
  }

  /**
   * Resolves whether an event is billable or not based on plan rules and overrides.
   */
  private async determineBillingStatus(businessId: string, eventType: string): Promise<string> {
    try {
      const billing = await this.prisma.businessBilling.findUnique({
        where: { businessId },
        include: {
          plan: {
            include: { rules: true },
          },
        },
      });

      if (!billing) {
        // Fallback: If no billing plan is configured yet, TOKEN_COMPLETED is billable by default
        return eventType === 'TOKEN_COMPLETED' ? 'UNPROCESSED' : 'NON_BILLABLE';
      }

      // Check custom overrides first
      if (billing.customPricing) {
        const pricing = billing.customPricing as Record<string, number>;
        if (pricing[eventType] !== undefined) {
          return pricing[eventType] > 0 ? 'UNPROCESSED' : 'NON_BILLABLE';
        }
      }

      // Check plan rules
      const rule = billing.plan.rules.find((r) => r.eventType === eventType);
      if (rule) {
        return Number(rule.price) > 0 ? 'UNPROCESSED' : 'NON_BILLABLE';
      }

      return 'NON_BILLABLE';
    } catch {
      return eventType === 'TOKEN_COMPLETED' ? 'UNPROCESSED' : 'NON_BILLABLE';
    }
  }
}
