import type { MedEventType, MedProgram } from '../../../engine/types';
import type { ProgramFlag } from './types';

const STATUS_TO_EVENT: Record<string, MedEventType> = {
  ACCEPTED: 'ACCEPTANCE',
  WAITLISTED: 'WAITLIST',
  REJECTED: 'REJECTION',
  INTERVIEW: 'INTERVIEW',
  WITHDRAWN: 'WITHDRAWN',
  HOLD: 'HOLD',
};

/** Admit's `current_status` to a MedEventType; anything else (SECONDARY and unknown values included) is null and gets counted by the caller. */
export function mapStatus(raw: string): MedEventType | null {
  return STATUS_TO_EVENT[raw.trim().toUpperCase()] ?? null;
}

/** UNREADABLE means the program is not reported (null), never defaulted to REG (spec §4a, P12). */
export function flagToProgram(flag: ProgramFlag): MedProgram | null {
  return flag === 'UNREADABLE' ? null : flag;
}
