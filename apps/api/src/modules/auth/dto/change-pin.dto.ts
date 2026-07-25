import { IsString, Length, Matches } from 'class-validator';

export class ChangePinDto {
  @IsString()
  @Length(4, 4, { message: 'Current PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'Current PIN must be 4 digits' })
  currentPin!: string;

  @IsString()
  @Length(4, 4, { message: 'New PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'New PIN must be 4 digits' })
  newPin!: string;
}

export class CustomerSetPinDto {
  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin!: string;
}
