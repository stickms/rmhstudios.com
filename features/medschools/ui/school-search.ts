import type { MedChartedTypeId } from '../medschools.contract';
import type { parseSchoolSearch } from '../engine/search';

/** The school page's typed search (what the tabs read) and the one function that changes it. */
export type SchoolSearch = ReturnType<typeof parseSchoolSearch>;
export type SchoolSearchPatch = Partial<Omit<SchoolSearch, 'show' | 'type'>> & {
  show?: readonly MedChartedTypeId[];
  type?: MedChartedTypeId;
};
export type SetSchoolSearch = (patch: SchoolSearchPatch) => void;
