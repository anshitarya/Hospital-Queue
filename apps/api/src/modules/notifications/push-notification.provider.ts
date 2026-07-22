import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationChannel, NotificationProvider, OutboundMessage } from './notification.provider';
import { PrismaService } from '../../common/prisma/prisma.service';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface StaffBookingNotificationParams {
  clinicId?: string | null;
  doctorId?: string | null;
  patientName: string;
  doctorName: string;
  tokenCode: string;
}

@Injectable()
export class PushNotificationProvider implements NotificationProvider {
  readonly name = 'web-push';
  private readonly logger = new Logger(PushNotificationProvider.name);
  private vapidKeys: VapidKeys;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.vapidKeys = this.initializeVapidKeys();
    const vapidEmail = this.config.get<string>('VAPID_SUBJECT', 'mailto:admin@turnos.app');
    webpush.setVapidDetails(vapidEmail, this.vapidKeys.publicKey, this.vapidKeys.privateKey);
    this.logger.log('Web Push VAPID initialized successfully');
  }

  private initializeVapidKeys(): VapidKeys {
    const envPublic = this.config.get<string>('VAPID_PUBLIC_KEY');
    const envPrivate = this.config.get<string>('VAPID_PRIVATE_KEY');

    if (envPublic && envPrivate) {
      return { publicKey: envPublic, privateKey: envPrivate };
    }

    const keyFilePath = path.join(__dirname, 'vapid-keys.json');
    if (fs.existsSync(keyFilePath)) {
      try {
        const fileContent = fs.readFileSync(keyFilePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.publicKey && parsed.privateKey) {
          return parsed;
        }
      } catch (err) {
        this.logger.warn(`Could not read vapid-keys.json: ${(err as Error).message}`);
      }
    }

    // Auto-generate VAPID keys if none exist (zero-config dev setup)
    const generated = webpush.generateVAPIDKeys();
    try {
      fs.writeFileSync(keyFilePath, JSON.stringify(generated, null, 2), 'utf8');
      this.logger.log('Generated new VAPID key pair and saved to vapid-keys.json');
    } catch (err) {
      this.logger.warn(`Could not persist generated VAPID keys to file: ${(err as Error).message}`);
    }

    return generated;
  }

  getPublicKey(): string {
    return this.vapidKeys.publicKey;
  }

  supports(channel: NotificationChannel): boolean {
    return channel === 'PUSH';
  }

  async send(message: OutboundMessage): Promise<{ id: string; status: 'sent' | 'queued' | 'failed' }> {
    // message.to is either a phone number or userId
    const to = message.to;

    // Fetch matching subscriptions for this user
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        OR: [
          { userId: to },
          { user: { phone: to } },
        ],
      },
    });

    if (subscriptions.length === 0) {
      return { id: '', status: 'failed' };
    }

    const titleMap: Record<string, string> = {
      queue_joined: 'Joined Queue',
      turn_soon: 'Turn Coming Up!',
      almost_next: "You're Next Up!",
      turn_now: "It's Your Turn!",
      doctor_delayed: 'Doctor Delayed',
      queue_cleared: 'Appointment Cancelled',
      doctor_paused: 'Queue Paused',
      doctor_resumed: 'Queue Resumed',
      doctor_break: 'Doctor Break',
      staff_self_booking: 'New Patient Self-Booking',
    };

    const title = titleMap[message.template] || 'Queue Update';
    const payload = JSON.stringify({
      title,
      body: message.body || 'You have a new update in Turnos.',
      icon: '/logo-icon.png',
      badge: '/logo-icon.png',
      template: message.template,
      data: {
        url: '/patient',
        timestamp: Date.now(),
      },
    });

    let sentCount = 0;
    const failedIds: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };
          await webpush.sendNotification(pushSubscription, payload);
          sentCount++;
        } catch (err: any) {
          this.logger.warn(`Push delivery failed for subscription ${sub.id}: ${err.message}`);
          // If subscription is expired or invalid, perform soft cleanup
          if (err.statusCode === 410 || err.statusCode === 404) {
            failedIds.push(sub.id);
          }
        }
      }),
    );

    // Clean up expired subscriptions
    if (failedIds.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: failedIds } },
      }).catch((err) => {
        this.logger.error(`Failed to delete expired subscriptions: ${err.message}`);
      });
      this.logger.log(`Cleaned up ${failedIds.length} expired push subscriptions`);
    }

    return {
      id: subscriptions.map((s) => s.id).join(','),
      status: sentCount > 0 ? 'sent' : 'failed',
    };
  }

  /**
   * Sends web push notification to staff members (receptionists, doctors, clinic admins)
   * when a patient performs a self-booking.
   */
  async sendToStaff(params: StaffBookingNotificationParams) {
    const { clinicId, doctorId, patientName, doctorName, tokenCode } = params;

    const staffSubscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        user: {
          role: { in: ['RECEPTIONIST', 'CLINIC_ADMIN', 'DOCTOR', 'MANAGER', 'ADMIN'] },
          OR: [
            ...(clinicId ? [{ clinicId }] : []),
            ...(doctorId ? [{ doctorProfile: { id: doctorId } }] : []),
          ],
        },
      },
      include: {
        user: { select: { role: true } },
      },
    });

    if (staffSubscriptions.length === 0) {
      return { sentCount: 0 };
    }

    let sentCount = 0;
    const failedIds: string[] = [];

    await Promise.all(
      staffSubscriptions.map(async (sub) => {
        const isDoctorRole = sub.user.role === 'DOCTOR';
        const targetUrl = isDoctorRole ? '/doctor' : '/reception';

        const payload = JSON.stringify({
          title: 'New Patient Self-Booking',
          body: `${patientName} booked an appointment with ${doctorName} (Token ${tokenCode})`,
          icon: '/logo-icon.png',
          badge: '/logo-icon.png',
          template: 'staff_self_booking',
          data: {
            url: targetUrl,
            timestamp: Date.now(),
          },
        });

        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };
          await webpush.sendNotification(pushSubscription, payload);
          sentCount++;
        } catch (err: any) {
          this.logger.warn(`Staff push delivery failed for subscription ${sub.id}: ${err.message}`);
          if (err.statusCode === 410 || err.statusCode === 404) {
            failedIds.push(sub.id);
          }
        }
      }),
    );

    if (failedIds.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: failedIds } },
      }).catch(() => {});
      this.logger.log(`Cleaned up ${failedIds.length} expired staff push subscriptions`);
    }

    return { sentCount };
  }
}
