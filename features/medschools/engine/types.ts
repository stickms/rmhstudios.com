/** Anonymous shapes only: no person fields exist here, and `types.test.ts` pins the exact key sets. */
export type MedSource = 'CYCLETRACK' | 'ADMIT' | 'SDN' | 'MDAPPLICANTS' | 'RMH';
export type MedProgram = 'REG' | 'PHD';
export type MedEventType = 'SECONDARY' | 'INTERVIEW' | 'WAITLIST' | 'REJECTION' | 'ACCEPTANCE' | 'WITHDRAWN' | 'HOLD';
export type MedResidence = 'GLOBAL' | 'IN_STATE' | 'OUT_OF_STATE';

export interface NormalizedCount {
  source: MedSource;
  schoolKey: string;
  program: MedProgram;
  cycleYear: number;
  /** YYYY-MM-DD */
  date: string;
  eventType: MedEventType;
  count: number;
  contributors: number | null;
}

export interface NormalizedEvent {
  source: MedSource;
  schoolKey: string;
  cycleYear: number;
  program: MedProgram | null;
  eventType: MedEventType;
  occurredAt: Date;
  dedupeHash: string;
  inState: boolean | null;
}
