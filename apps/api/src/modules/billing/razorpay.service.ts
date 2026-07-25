import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private razorpay: Razorpay;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    if (!keyId || !keySecret) {
      this.logger.warn('Razorpay Key ID or Secret is missing in configurations. Payment operations might fail.');
    }

    this.razorpay = new Razorpay({
      key_id: keyId || 'rzp_test_placeholder',
      key_secret: keySecret || 'placeholder_secret',
    });
  }

  async createOrder(amountInPaise: number, receipt: string, notes?: Record<string, string>) {
    try {
      this.logger.log(`Creating Razorpay Order for amount: ${amountInPaise} paise`);
      const order = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: notes || {},
      });
      return order;
    } catch (error) {
      this.logger.error('Failed to create Razorpay Order', error);
      throw error;
    }
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = this.configService.get<string>('razorpay.keySecret');
    if (!secret) {
      this.logger.error('Razorpay key secret is missing. Cannot verify signature.');
      return false;
    }

    try {
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      return generatedSignature === signature;
    } catch (error) {
      this.logger.error('Error verifying Razorpay payment signature', error);
      return false;
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.configService.get<string>('razorpay.webhookSecret');
    if (!secret) {
      this.logger.error('Razorpay webhook secret is missing. Cannot verify signature.');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Error verifying Razorpay webhook signature', error);
      return false;
    }
  }
}
