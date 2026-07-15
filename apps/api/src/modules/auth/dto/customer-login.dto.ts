import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile, isValidIndianMobile } from '../../../common/utils/phone';

export class CustomerLoginDto {
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    if (isValidIndianMobile(value)) return normalizeIndianMobile(value).e164;
    return value;
  })
  @IsString()
  phone!: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin!: string;
}
