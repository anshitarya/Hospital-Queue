import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * OtpService uses MSG91 OTP Widget API (v5) directly for phone channel OTP generation and verification.
 * No local Redis code storing or fallback verification is used — MSG91 generates, delivers, and verifies all OTPs.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly authKey: string | undefined;
  private readonly widgetId: string | undefined;

  // Rate limits
  private readonly ISSUE_LIMIT = 5;
  private readonly VERIFY_LIMIT = 5;
  private readonly LIMIT_WINDOW_SECONDS = 600;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.ttl = config.get<number>('otp.ttlSeconds') ?? 300;
    this.authKey = config.get<string>('msg91.authKey');
    this.widgetId = config.get<string>('msg91.widgetId');
  }

  private issueRateKey(channel: Channel, target: string) {
    return `otp:rate:issue:${channel}:${target}`;
  }

  private verifyRateKey(channel: Channel, target: string) {
    return `otp:rate:verify:${channel}:${target}`;
  }

  /**
   * Triggers MSG91 to generate and send an OTP via its Widget API.
   * MSG91 generates the OTP and delivers it via SMS (DLT handled automatically by MSG91 Widget).
   * We store only the returned `reqId` in Redis to perform verification later.
   */
  async issue(channel: Channel, target: string): Promise<void> {
    const rk = this.issueRateKey(channel, target);
    const count = await this.redis.client.incr(rk);
    if (count === 1) await this.redis.client.expire(rk, this.LIMIT_WINDOW_SECONDS);
    if (count > this.ISSUE_LIMIT) {
      throw new HttpException(
        'Too many OTP requests. Please wait for 10 minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cleanAuthKey = (this.authKey ?? '').trim();
    const cleanWidgetId = (this.widgetId ?? '').trim();

    if (channel !== 'phone' || !cleanAuthKey || !cleanWidgetId) {
      this.logger.warn(`[DEV MODE / NO MSG91 CONFIG] target=${target} — MSG91 not fully configured.`);
      return;
    }

    const digits = target.replace(/\D/g, '');
    const mobileWith91 = digits.startsWith('91') ? digits : `91${digits}`;

    const widgetUrl = `https://control.msg91.com/api/v5/widget/sendOtp?authkey=${encodeURIComponent(cleanAuthKey)}&widgetId=${encodeURIComponent(cleanWidgetId)}`;
    const res = await fetch(widgetUrl, {
      method: 'POST',
      headers: {
        authkey: cleanAuthKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        widgetId: cleanWidgetId,
        widget_id: cleanWidgetId,
        identifier: mobileWith91,
        mobile: mobileWith91,
        authkey: cleanAuthKey,
      }),
    });

    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    this.logger.log(`MSG91 Widget sendOtp response: status=${res.status} body=${JSON.stringify(data)}`);

    if (res.ok && data.type !== 'error' && data.status !== 'fail' && data.message) {
      const reqId = data.message;
      await this.redis.client.set(`otp:reqId:${target}`, reqId, 'EX', this.ttl);
      this.logger.log(`[MSG91 WIDGET SUCCESS] Sent OTP to ${mobileWith91} (reqId: ${reqId})`);
      return;
    }

    this.logger.error(`[MSG91 WIDGET ERROR] Failed to send OTP to ${mobileWith91}: ${JSON.stringify(data)}`);
    throw new HttpException(data.message ?? 'Failed to send OTP via MSG91.', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /**
   * Verifies the OTP code submitted by the user strictly through MSG91 Widget verification API.
   */
  async verify(channel: Channel, target: string, code: string): Promise<boolean> {
    const vk = this.verifyRateKey(channel, target);
    const attempts = await this.redis.client.incr(vk);
    if (attempts === 1) await this.redis.client.expire(vk, this.LIMIT_WINDOW_SECONDS);
    if (attempts > this.VERIFY_LIMIT) {
      throw new HttpException(
        'Too many verification attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cleanAuthKey = (this.authKey ?? '').trim();
    const cleanWidgetId = (this.widgetId ?? '').trim();

    const reqId = await this.redis.client.get(`otp:reqId:${target}`);

    if (channel === 'phone' && cleanAuthKey && cleanWidgetId && reqId) {
      try {
        const response = await fetch('https://control.msg91.com/api/v5/widget/verifyOtp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authkey: cleanAuthKey,
          },
          body: JSON.stringify({
            widgetId: cleanWidgetId,
            reqId,
            otp: code,
          }),
        });

        const data = await response.json().catch(() => ({}));
        this.logger.log(`MSG91 Widget verifyOtp response: status=${response.status} body=${JSON.stringify(data)}`);

        if (response.ok && data.type !== 'error' && data.message !== 'OTP not match' && data.message !== 'Invalid OTP') {
          await this.redis.client.del(`otp:reqId:${target}`);
          await this.redis.client.del(vk);
          return true;
        }
      } catch (err) {
        this.logger.error('MSG91 Widget verifyOtp exception', err as Error);
      }
    }

    throw new BadRequestException('Invalid or expired OTP. Please request a new code.');
  }
}

export type Channel = 'phone' | 'email';
