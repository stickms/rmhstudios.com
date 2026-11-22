/**
 * The one-key-per-source rule for school aliases (phase 2a D4).
 *
 * CycleTrack's diff and Admit's stats upserts are per (school, source), so two
 * keys on one school would overwrite each other every run; a key that maps to
 * two schools would feed both. Sources that publish several threads per school
 * (SDN, MDAPPLICANTS) may hold several keys.
 */
import type { MedSource } from './types';

export const SINGLE_KEY_SOURCES: readonly MedSource[] = ['CYCLETRACK', 'ADMIT'];

export type AliasPlan =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: 'KEY_MAPPED_ELSEWHERE' | 'SCHOOL_ALREADY_HAS_KEY';
      message: string;
    };

/** Decides whether `source:sourceKey` may be attached to `schoolId`. Mapping a key to the school that already owns it is `ok` (idempotent). */
export function planAliasMapping(input: {
  source: MedSource;
  sourceKey: string;
  schoolId: string;
  schoolAliases: Array<{
    source: MedSource;
    sourceKey: string;
  }>;
  keyOwner: {
    schoolId: string;
  } | null;
}): AliasPlan {
  const { source, sourceKey, schoolId, schoolAliases, keyOwner } = input;
  if (keyOwner !== null) {
    if (keyOwner.schoolId === schoolId)
      return {
        ok: true,
      };
    return {
      ok: false,
      code: 'KEY_MAPPED_ELSEWHERE',
      message: `${source} key "${sourceKey}" already belongs to another school`,
    };
  }
  if (SINGLE_KEY_SOURCES.includes(source) && schoolAliases.some((a) => a.source === source)) {
    return {
      ok: false,
      code: 'SCHOOL_ALREADY_HAS_KEY',
      message: `this school already has a ${source} key`,
    };
  }
  return {
    ok: true,
  };
}
