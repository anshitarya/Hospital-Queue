import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * OtpService issues and verifies 4-digit one-time codes.
 *
 * For phone OTPs with MSG91 configured (MSG91_AUTH_KEY set):
 *   - MSG91's Dedicated OTP API generates and sends its own random OTP.
 *   - Verification is done via MSG91's verify endpoint.
 *   - Our backend does NOT generate or store the OTP — MSG91 owns the full lifecycle.
 *
 * For email channel or when MSG91 is not configured:
 *   - A random 4-digit code is generated, stored in Redis, and logged.
 *   - Verification is done against the Redis-stored code.
 *
 * Per-target rate limits apply to both issuance and verification.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly authKey: string | undefined;

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
    this.authKey = config.get<string>('msg91.authKey');
  }

  /** Redis key for the active OTP (used only for email / dev fallback). */
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
   * Issues a new OTP for the given (channel, target) pair.
   *
   * Phone + MSG91: calls MSG91 Dedicated OTP API. MSG91 generates a random
   * 4-digit code and delivers it via SMS. We do NOT know or store the code.
   *
   * Email / no MSG91: generates a random 4-digit code, stores in Redis, logs it.
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

    // ── Phone + MSG91 configured: let MSG91 generate & send the OTP ──────
    if (channel === 'phone' && cleanAuthKey) {
      const digits = target.replace(/\D/g, '');
      const mobileWith91 = digits.startsWith('91') ? digits : `91${digits}`;

      const templateId = process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_SMS_TEMPLATE_ID;
      let otpUrl = `https://control.msg91.com/api/v5/otp?authkey=${encodeURIComponent(cleanAuthKey)}&mobile=${encodeURIComponent(mobileWith91)}&otp_length=4&otp_expiry=5`;
      if (templateId) {
        otpUrl += `&template_id=${encodeURIComponent(templateId)}`;
      }

      const res = await fetch(otpUrl, {
        method: 'POST',
        headers: {
          authkey: cleanAuthKey,
          'Content-Type': 'application/json',
        },
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

      this.logger.log(`MSG91 sendOtp response: status=${res.status} body=${JSON.stringify(data)}`);

      if (res.ok && (data.type === 'success' || data.request_id)) {
        this.logger.log(`[MSG91 SUCCESS] OTP sent to ${mobileWith91} (request_id: ${data.request_id ?? 'n/a'})`);
        return;
      }

      this.logger.error(`[MSG91 ERROR] Failed to send OTP to ${mobileWith91}: ${JSON.stringify(data)}`);
      throw new HttpException('Failed to send OTP. Please try again.', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // ── Email / no MSG91: generate code, store in Redis, log it ──────────
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await this.redis.client.set(this.key(channel, target), code, 'EX', this.ttl);
    this.logger.warn(`[DEV OTP LOG] target=${target} code=${code}`);
  }

  /**
   * Verifies a code. Throws BadRequestException on failure.
   *
   * Phone + MSG91: calls MSG91 Dedicated OTP verify endpoint.
   * Email / no MSG91: checks against the Redis-stored code.
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

    // ── Phone + MSG91: verify via MSG91 Dedicated OTP verify endpoint ────
    if (channel === 'phone' && cleanAuthKey) {
      const digits = target.replace(/\D/g, '');
      const mobileWith91 = digits.startsWith('91') ? digits : `91${digits}`;

      try {
        const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=${encodeURIComponent(mobileWith91)}&otp=${encodeURIComponent(code)}&authkey=${encodeURIComponent(cleanAuthKey)}`;
        const response = await fetch(verifyUrl, {
          method: 'GET',
          headers: { authkey: cleanAuthKey },
        });

        const data = await response.json().catch(() => ({}));
        this.logger.log(`MSG91 verifyOtp response: status=${response.status} body=${JSON.stringify(data)}`);

        const msgLower = (data.message ?? '').toString().toLowerCase();
        if (data.type === 'success' || msgLower.includes('verified') || msgLower.includes('already')) {
          await this.redis.client.del(vk); // reset rate-limit counter on success
          return true;
        }
      } catch (err) {
        this.logger.error('MSG91 OTP verify exception', err as Error);
      }

      throw new BadRequestException('Invalid OTP');
    }

    // ── Email / no MSG91: verify against Redis ───────────────────────────
    const stored = await this.redis.client.get(this.key(channel, target));

    if (stored && stored === code) {
      await this.redis.client.del(this.key(channel, target));
      await this.redis.client.del(vk);
      return true;
    }

    if (stored && stored !== code) {
      throw new BadRequestException('Invalid OTP');
    }

    throw new BadRequestException('Invalid or expired OTP (code was expired or never issued). Please request a new code.');
  }
}

export type Channel = 'phone' | 'email';
