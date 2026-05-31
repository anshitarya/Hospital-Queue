import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @Matches(/[A-Za-z]/, { message: 'New password must contain at least one letter' })
  @Matches(/\d/, { message: 'New password must contain at least one digit' })
  newPassword!: string;
}
