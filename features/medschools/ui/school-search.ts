import type { MedChartedTypeId } from '../medschools.contract';
import type { ProgramFilter, parseSchoolSearch } from '../engine/search';
import type { MedEventType } from '../engine/types';

/**
 * The school page's typed search as the tabs read it: the parsed URL with `program` and `show` resolved through the
 * viewer's preferences (the effective view), so the tabs never see an absent value.
 */
export type SchoolSearch = Omit<ReturnType<typeof parseSchoolSearch>, 'program' | 'show'> & {
  program: ProgramFilter;
  show: MedEventType[];
};
export type SchoolSearchPatch = Partial<Omit<SchoolSearch, 'show' | 'type'>> & {
  show?: readonly MedChartedTypeId[];
  type?: MedChartedTypeId;
};
export type SetSchoolSearch = (patch: SchoolSearchPatch) => void;
