import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class SaveConfigDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sectionOrder?: string[];

  @IsBoolean()
  @IsOptional()
  showLogo?: boolean;

  @IsBoolean()
  @IsOptional()
  showPatientAge?: boolean;

  @IsBoolean()
  @IsOptional()
  showPatientMobile?: boolean;

  @IsBoolean()
  @IsOptional()
  showPatientAddress?: boolean;

  @IsBoolean()
  @IsOptional()
  showDate?: boolean;

  @IsBoolean()
  @IsOptional()
  showSignature?: boolean;

  @IsBoolean()
  @IsOptional()
  showVitals?: boolean;

  @IsBoolean()
  @IsOptional()
  showSymptoms?: boolean;

  @IsBoolean()
  @IsOptional()
  showDiagnosis?: boolean;

  @IsBoolean()
  @IsOptional()
  showAdvice?: boolean;

  @IsBoolean()
  @IsOptional()
  showInvestigations?: boolean;

  @IsBoolean()
  @IsOptional()
  headerEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  footerEnabled?: boolean;

  @IsString()
  @IsOptional()
  customHeaderText?: string;

  @IsString()
  @IsOptional()
  customFooterText?: string;

  @IsString()
  @IsOptional()
  signatureUrl?: string;

  @IsString()
  @IsOptional()
  templateStyle?: string;

  @IsBoolean()
  @IsOptional()
  showMedicineTable?: boolean;

  @IsString()
  @IsOptional()
  logoPosition?: string;

  @IsString()
  @IsOptional()
  headerTextPosition?: string;

  @IsString()
  @IsOptional()
  customClinicName?: string;

  @IsString()
  @IsOptional()
  customDoctorName?: string;

  @IsString()
  @IsOptional()
  qualifications?: string;

  @IsString()
  @IsOptional()
  specializationText?: string;

  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsString()
  @IsOptional()
  contactNumber?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  addressLine1?: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  @IsOptional()
  consultingHours?: string;

  @IsString()
  @IsOptional()
  emergencyWarning?: string;

  @IsString()
  @IsOptional()
  watermarkUrl?: string;
}
