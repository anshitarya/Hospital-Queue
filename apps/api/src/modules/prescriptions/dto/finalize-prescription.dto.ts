import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MedicineItemDto {
  @IsString()
  @IsNotEmpty()
  medicine: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsString()
  @IsOptional()
  form?: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsNotEmpty()
  frequency: string;

  @IsString()
  @IsOptional()
  frequencyPattern?: string;

  @IsString()
  @IsOptional()
  timing?: string;

  @IsString()
  @IsNotEmpty()
  duration: string;

  @IsInt()
  @IsOptional()
  totalQuantity?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  prescriptionId?: string;
}

export class FinalizePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  visitId: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  symptoms?: string;

  @IsString()
  @IsOptional()
  advice?: string;

  @IsString()
  @IsOptional()
  allergies?: string;

  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @IsString()
  @IsOptional()
  investigationsOrdered?: string;

  @IsString()
  @IsOptional()
  referral?: string;

  @IsString()
  @IsOptional()
  followUpNote?: string;

  @IsString()
  @IsOptional()
  followUpDate?: string; // ISO string

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicineItemDto)
  @IsOptional()
  medicines?: MedicineItemDto[];

  @IsOptional()
  sendWhatsApp?: boolean;
}
