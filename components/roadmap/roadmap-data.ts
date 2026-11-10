import type { YearSection } from "./roadmap-types";
import { ROADMAP_YEARS_1 } from "./roadmap-data-1";
import { ROADMAP_YEARS_2 } from "./roadmap-data-2";
import { ROADMAP_YEARS_3 } from "./roadmap-data-3";
import { ROADMAP_YEARS_4 } from "./roadmap-data-4";

/** The full chronology, in order: Year 1 through Years 751–1,000. */
export const roadmap: YearSection[] = [
  ...ROADMAP_YEARS_1,
  ...ROADMAP_YEARS_2,
  ...ROADMAP_YEARS_3,
  ...ROADMAP_YEARS_4,
];
