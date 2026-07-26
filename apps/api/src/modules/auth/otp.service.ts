import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * OtpService issues and verifies 6-digit one-time codes.
 *
 * Codes are stored in Redis with a TTL (default 5 min) and per-target rate
 * limits (5 issuances / 10 min, 5 verify attempts / 10 min). The same
 * service handles both phone and email channels — pass the channel arg.
 *
 * Production swap-in:
 *   - phone:  inject an SMS provider (Twilio, MSG91, AWS SNS) instead of logging.
 *   - email:  inject an email provider (SES, Resend, Postmark, SendGrid).
 *
 * Codes are stored in plaintext for now. For higher security, hash them
 * with sha256 before storing and compare hashes on verify — that prevents
 * an attacker who reads Redis from harvesting active codes.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly devMode: boolean;
  private readonly authKey: string | undefined;
  private readonly widgetId: string | undefined;

  // Per-target limits — keep them tight; OTP endpoints are unauthenticated.
  private readonly ISSUE_LIMIT = 3;
  private readonly VERIFY_LIMIT = 5;
  private readonly LIMIT_WINDOW_SECONDS = 600;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.ttl = config.get<number>('otp.ttlSeconds') ?? 300;
    this.devMode = config.get<boolean>('otp.devMode') ?? true;
    this.authKey = config.get<string>('msg91.authKey');
    this.widgetId = config.get<string>('msg91.widgetId');
  }

  /** Redis key for the active OTP. */
  private key(channel: Channel, target: string) {
    return `otp:${channel}:${target}`;
  }
  /** Rate-limit key — counts issuances. */
  private issueRateKey(channel: Channel, target: string) {
    return `otp:rate:issue:${channel}:${target}`;
  }
  /** Rate-limit key — counts verify attempts (resets on success). */
  private verifyRateKey(channel: Channel, target: string) {
    return `otp:rate:verify:${channel}:${target}`;
  }

  /**
   * Issues a new OTP for the given (channel, target) pair. Existing OTP for
   * the same key is overwritten — this prevents enumeration via re-issuance.
   * In dev mode the code is logged and returned in the response so testers
   * can read it without an SMS provider.
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

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await this.redis.client.set(this.key(channel, target), code, 'EX', this.ttl);

    if (channel !== 'phone' || !this.authKey) {
      this.logger.warn(`[SERVER LOG ONLY - DEV OTP] target=${target} code=${code}`);
      return;
    }

    const digits = target.replace(/\D/g, '');
    const mobile = digits.startsWith('91') ? digits : `91${digits}`;
    let sentRealSms = false;

    // 1. Try MSG91 Dedicated Send OTP API
    try {
      const templateId = process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_SMS_TEMPLATE_ID;
      let otpUrl = `https://control.msg91.com/api/v5/otp?authkey=${encodeURIComponent(this.authKey)}&mobile=${encodeURIComponent(mobile)}&otp=${encodeURIComponent(code)}&otp_length=4&otp_expiry=5`;
      if (templateId) {
        otpUrl += `&template_id=${encodeURIComponent(templateId)}`;
      }

      const res = await fetch(otpUrl, {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authkey: this.authKey,
          mobile,
          otp: code,
          otp_length: 4,
          otp_expiry: 5,
          ...(templateId ? { template_id: templateId } : {}),
        }),
      });

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { message: text }; }

      if (res.ok && data.type !== 'error' && data.status !== 'fail') {
        this.logger.log(`Sent OTP via MSG91 Dedicated OTP API to ${mobile}`);
        sentRealSms = true;
      } else {
        this.logger.warn(`MSG91 Dedicated OTP API returned: ${JSON.stringify(data)}. Retrying via Widget API.`);
      }
    } catch (err) {
      this.logger.warn('MSG91 Dedicated OTP API exception', err as Error);
    }

    // 2. Try MSG91 Widget OTP API if widgetId is set
    if (!sentRealSms && this.widgetId) {
      try {
        const widgetUrl = `https://control.msg91.com/api/v5/widget/sendOtp?authkey=${encodeURIComponent(this.authKey)}&widgetId=${encodeURIComponent(this.widgetId)}`;
        const res = await fetch(widgetUrl, {
          method: 'POST',
          headers: {
            authkey: this.authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            widgetId: this.widgetId,
            widget_id: this.widgetId,
            identifier: mobile,
            mobile,
            authkey: this.authKey,
          }),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { message: text }; }

        if (res.ok && data.type !== 'error' && data.status !== 'fail' && data.message) {
          await this.redis.client.set(`otp:reqId:${target}`, data.message, 'EX', this.ttl);
          this.logger.log(`Sent OTP via MSG91 Widget API to ${mobile}`);
          sentRealSms = true;
        } else {
          this.logger.warn(`MSG91 Widget API returned: ${JSON.stringify(data)}. Retrying via Flow/SMS API.`);
        }
      } catch (err) {
        this.logger.warn('MSG91 Widget API exception', err as Error);
      }
    }

    // 3. Fallback to MSG91 Flow/SMS API
    if (!sentRealSms) {
      try {
        const templateId = process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_SMS_TEMPLATE_ID;
        const smsUrl = templateId ? 'https://api.msg91.com/api/v5/flow/' : 'https://api.msg91.com/api/v5/sms';

        const body = templateId ? {
          template_id: templateId,
          short_url: '0',
          recipients: [{ mobiles: mobile, code, otp: code }],
        } : {
          sender: process.env.MSG91_SENDER_ID ?? 'TURNOS',
          route: '4',
          country: '91',
          sms: [{ message: `Your Turnos verification code is ${code}. Valid for 5 minutes.`, to: [mobile.replace(/^91/, '')] }],
        };

        const res = await fetch(smsUrl, {
          method: 'POST',
          headers: {
            authkey: this.authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { message: text }; }

        if (res.ok && data.type !== 'error') {
          this.logger.log(`Sent OTP via MSG91 Flow/SMS API to ${mobile}`);
          sentRealSms = true;
        } else {
          this.logger.error(`MSG91 Flow/SMS API error: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error('MSG91 Flow/SMS API exception', err as Error);
      }
    }
  }

  /**
   * Verifies a code. Throws BadRequestException on failure with a clear
   * message. Successful verification deletes the stored code (one-use) and
   * resets the verify-attempt counter.
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

    // Check local Redis key first
    const stored = await this.redis.client.get(this.key(channel, target));
    if (stored && stored === code) {
      await this.redis.client.del(this.key(channel, target));
      await this.redis.client.del(`otp:reqId:${target}`);
      await this.redis.client.del(vk);
      return true;
    }

    const useRealMsg91 = channel === 'phone' && this.authKey && this.widgetId && !this.devMode;
    const reqId = await this.redis.client.get(`otp:reqId:${target}`);

    if (useRealMsg91 && reqId) {
      try {
        const response = await fetch('https://control.msg91.com/api/v5/widget/verifyOtp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authkey: this.authKey!,
          },
          body: JSON.stringify({
            widgetId: this.widgetId,
            reqId,
            otp: code,
          }),
        });

        const data = await response.json();
        if (response.ok && data.type !== 'error' && data.message !== 'OTP not match' && data.message !== 'Invalid OTP') {
          await this.redis.client.del(`otp:reqId:${target}`);
          await this.redis.client.del(vk);
          return true;
        }
      } catch (err) {
        this.logger.error('MSG91 Widget verifyOtp exception', err as Error);
      }
    }

    if (stored && stored !== code) {
      throw new BadRequestException('Invalid OTP');
    }

    throw new BadRequestException('Invalid or expired OTP. Please request a new code.');
  }
}

export type Channel = 'phone' | 'email';
