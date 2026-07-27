import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * OtpService issues and verifies 4-digit one-time codes.
 *
 * Primary: MSG91 OTP Widget API (v5) — handles DLT registration & SMS delivery.
 * Fallback: MSG91 Dedicated OTP API or Local Redis storage for dev/testing.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly authKey: string | undefined;
  private readonly widgetId: string | undefined;
  private readonly tokenAuth: string | undefined;

  // Tight rate limits for unauthenticated OTP endpoints
  private readonly ISSUE_LIMIT = 3;
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
    this.tokenAuth = config.get<string>('msg91.tokenAuth');
  }

  /** Redis key for active OTP code */
  private key(channel: Channel, target: string) {
    return `otp:${channel}:${target}`;
  }
  /** Rate-limit key — counts issuances */
  private issueRateKey(channel: Channel, target: string) {
    return `otp:rate:issue:${channel}:${target}`;
  }
  /** Rate-limit key — counts verify attempts */
  private verifyRateKey(channel: Channel, target: string) {
    return `otp:rate:verify:${channel}:${target}`;
  }

  /**
   * Issues a 4-digit OTP for the given (channel, target) pair.
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

    // Always generate a local 4-digit code and save to Redis as fallback/dev store
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await this.redis.client.set(this.key(channel, target), code, 'EX', this.ttl);

    const cleanAuthKey = (this.authKey ?? '').trim();
    const cleanWidgetId = (this.widgetId ?? '').trim();

    if (channel !== 'phone' || !cleanAuthKey) {
      this.logger.warn(`[DEV OTP LOG] target=${target} code=${code}`);
      return;
    }

    const digits = target.replace(/\D/g, '');
    const mobileWith91 = digits.startsWith('91') ? digits : `91${digits}`;
    let sentRealSms = false;

    // 1. Primary: MSG91 OTP Widget API (v5) — carries DLT template automatically
    if (cleanWidgetId) {
      try {
        const cleanTokenAuth = (this.tokenAuth ?? '').trim();
        const widgetUrl = `https://api.msg91.com/api/v5/widget/sendOtp`;
        const res = await fetch(widgetUrl, {
          method: 'POST',
          headers: {
            authkey: cleanAuthKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            widgetId: cleanWidgetId,
            identifier: mobileWith91,
            ...(cleanTokenAuth ? { tokenAuth: cleanTokenAuth } : {}),
          }),
        });

        let data: any;
        if (typeof res.text === 'function') {
          const text = await res.text();
          try { data = JSON.parse(text); } catch { data = { message: text }; }
        } else if (typeof (res as any).json === 'function') {
          data = await (res as any).json();
        } else {
          data = {};
        }

        this.logger.log(`MSG91 Widget sendOtp response: status=${res.status} body=${JSON.stringify(data)}`);

        if (res.ok && data.type !== 'error' && data.status !== 'fail' && data.message && data.message !== 'Invalid request') {
          const reqId = data.message ?? data.request_id;
          if (reqId) {
            await this.redis.client.set(`otp:reqId:${target}`, reqId, 'EX', this.ttl);
          }
          this.logger.log(`[MSG91 WIDGET SUCCESS] Sent OTP to ${mobileWith91} (reqId: ${reqId})`);
          sentRealSms = true;
        } else {
          this.logger.warn(`[MSG91 WIDGET INFO] Widget sendOtp returned status=${res.status} message="${data.message ?? ''}". Falling back to Dedicated OTP API...`);
        }
      } catch (err) {
        this.logger.warn('MSG91 Widget API exception, falling back to Dedicated OTP API', err as Error);
      }
    }

    // 2. Secondary Fallback: MSG91 Dedicated OTP API
    if (!sentRealSms) {
      try {
        const templateId = process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_SMS_TEMPLATE_ID;
        let otpUrl = `https://control.msg91.com/api/v5/otp?authkey=${encodeURIComponent(cleanAuthKey)}&mobile=${encodeURIComponent(mobileWith91)}&otp=${encodeURIComponent(code)}&otp_length=4&otp_expiry=5`;
        if (templateId) {
          otpUrl += `&template_id=${encodeURIComponent(templateId)}`;
        }

        const res = await fetch(otpUrl, {
          method: 'POST',
          headers: {
            authkey: cleanAuthKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authkey: cleanAuthKey,
            mobile: mobileWith91,
            otp: code,
            otp_length: 4,
            otp_expiry: 5,
            ...(templateId ? { template_id: templateId } : {}),
          }),
        });

        let data: any;
        if (typeof res.text === 'function') {
          const text = await res.text();
          try { data = JSON.parse(text); } catch { data = { message: text }; }
        } else if (typeof (res as any).json === 'function') {
          data = await (res as any).json();
        } else {
          data = {};
        }

        this.logger.log(`MSG91 Dedicated OTP fallback response: status=${res.status} body=${JSON.stringify(data)}`);

        if (res.ok && data.type !== 'error' && data.status !== 'fail' && (data.type === 'success' || data.message?.includes('success') || data.message?.includes('sent') || data.request_id)) {
          this.logger.log(`[MSG91 DEDICATED SUCCESS] Sent OTP to ${mobileWith91}`);
          sentRealSms = true;
        }
      } catch (err) {
        this.logger.warn('MSG91 Dedicated OTP fallback exception', err as Error);
      }
    }

    this.logger.log(`[OTP DISPATCH AUDIT] target=${target} code=${code} msg91_delivered=${sentRealSms}`);
  }

  /**
   * Verifies a 4-digit OTP code.
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

    // 1. Check local Redis store first (instant match for local dev / dedicated fallback code)
    const stored = await this.redis.client.get(this.key(channel, target));
    if (stored && stored === code) {
      await this.redis.client.del(this.key(channel, target));
      await this.redis.client.del(`otp:reqId:${target}`);
      await this.redis.client.del(vk);
      return true;
    }

    const cleanAuthKey = (this.authKey ?? '').trim();
    const cleanWidgetId = (this.widgetId ?? '').trim();
    const digits = target.replace(/\D/g, '');
    const mobileWith91 = digits.startsWith('91') ? digits : `91${digits}`;

    // 2. Check MSG91 Widget verification if reqId exists
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
          await this.redis.client.del(this.key(channel, target));
          await this.redis.client.del(vk);
          return true;
        }
      } catch (err) {
        this.logger.error('MSG91 Widget verifyOtp exception', err as Error);
      }
    }

    // 3. Check MSG91 Dedicated OTP verification endpoint
    if (channel === 'phone' && cleanAuthKey) {
      try {
        const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=${encodeURIComponent(mobileWith91)}&otp=${encodeURIComponent(code)}&authkey=${encodeURIComponent(cleanAuthKey)}`;
        const response = await fetch(verifyUrl, {
          method: 'GET',
          headers: {
            authkey: cleanAuthKey,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json().catch(() => ({}));
        this.logger.log(`MSG91 Dedicated OTP verify response: status=${response.status} body=${JSON.stringify(data)}`);
        const msgLower = (data.message ?? '').toString().toLowerCase();
        if (response.ok && (data.type === 'success' || msgLower.includes('success') || msgLower.includes('verified') || msgLower.includes('already'))) {
          await this.redis.client.del(this.key(channel, target));
          await this.redis.client.del(`otp:reqId:${target}`);
          await this.redis.client.del(vk);
          return true;
        }
      } catch (err) {
        this.logger.error('MSG91 Dedicated OTP verify exception', err as Error);
      }
    }

    if (stored && stored !== code) {
      throw new BadRequestException('Invalid OTP');
    }

    throw new BadRequestException('Invalid or expired OTP (code was expired or never issued). Please request a new code.');
  }
}

export type Channel = 'phone' | 'email';
