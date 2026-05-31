import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
