import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

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

  // Walk-in: insert near current_position + doctor.walkinGap instead of end of queue. Feature 1.
  @IsOptional()
  @IsBoolean()
  walkin?: boolean;

  // NEW (default) or FOLLOWUP — for follow-up slot reservation. Feature 6.
  @IsOptional()
  @IsIn(['NEW', 'FOLLOWUP'])
  slotType?: 'NEW' | 'FOLLOWUP';

  // Explicit queue position (1 = first). Overrides walk-in heuristics when set.
  @IsOptional()
  @IsInt()
  @Min(1)
  insertAtPosition?: number;

  @IsOptional()
  @IsString()
  appointmentTime?: string;
}

export class PatientJoinQueueDto {
  @IsString()
  doctorId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  appointmentTime?: string;
}

export class ReorderEntryDto {
  // New priority value. Set to 100 to insert as emergency.
  @IsInt()
  @Min(0)
  @Max(100)
  priority!: number;
}

export class MoveToPositionDto {
  @IsInt()
  @Min(1)
  position!: number;
}

export class ClearQueueDto {
  @IsOptional()
  @IsBoolean()
  includeMissed?: boolean;
}

export class CancelManyDto {
  @IsString({ each: true })
  entryIds!: string[];
}

// Feature 4: Doctor break with estimated duration.
export class StartBreakDto {
  @IsInt()
  @Min(1)
  @Max(480)
  estimatedMinutes!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class TransferPatientDto {
  @IsString()
  destinationDoctorId!: string;

  @IsOptional()
  @IsString()
  transferReason?: string;

  @IsOptional()
  @IsBoolean()
  walkin?: boolean;

  @IsOptional()
  @IsIn(['NEW', 'FOLLOWUP'])
  slotType?: 'NEW' | 'FOLLOWUP';
}
