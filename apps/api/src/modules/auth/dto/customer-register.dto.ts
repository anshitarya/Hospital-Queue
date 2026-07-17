import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeIndianMobile, isValidIndianMobile } from '../../../common/utils/phone';

export class CustomerRegisterDto {
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    if (isValidIndianMobile(value)) return normalizeIndianMobile(value).e164;
    return value;
  })
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name!: string;
}
