import { IsOptional, IsString } from 'class-validator';

export class SaveVitalsDto {
  @IsString()
  visitId: string;

  @IsString()
  @IsOptional()
  weight?: string;

  @IsString()
  @IsOptional()
  height?: string;

  @IsString()
  @IsOptional()
  bloodPressure?: string;

  @IsString()
  @IsOptional()
  temperature?: string;

  @IsString()
  @IsOptional()
  pulse?: string;

  @IsString()
  @IsOptional()
  spo2?: string;
}
