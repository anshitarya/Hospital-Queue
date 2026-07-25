import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubscriptionOrderDto {
  @IsString()
  @IsNotEmpty()
  planId: string;
}

export class VerifySubscriptionPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpay_order_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;
}
