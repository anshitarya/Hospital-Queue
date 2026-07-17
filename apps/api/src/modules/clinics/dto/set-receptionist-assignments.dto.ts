import { IsArray, IsObject, IsString } from 'class-validator';

export class SetReceptionistAssignmentsDto {
  /** receptionist user id → list of doctor ids they manage */
  @IsObject()
  assignments!: Record<string, string[]>;
}

export class SetOneReceptionistAssignmentsDto {
  @IsArray()
  @IsString({ each: true })
  doctorIds!: string[];
}
