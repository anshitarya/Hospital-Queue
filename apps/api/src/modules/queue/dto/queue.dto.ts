import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class JoinQueueDto {
  @IsString()
  doctorId!: string;

  @IsString()
  @MinLength(2)
  patientName!: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  patientPhone!: string;

  // 0 = normal, 50 = VIP, 100 = emergency. Higher wins.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Client-supplied idempotency key. Same key + same doctor returns the same entry
  // instead of creating a duplicate — guards against double-clicks on the reception form.
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class PatientJoinQueueDto {
  @IsString()
  doctorId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReorderEntryDto {
  // New priority value. Set to 100 to insert as emergency.
  @IsInt()
  @Min(0)
  @Max(100)
  priority!: number;
}
