import type { MedSchoolListItemDto } from '../medschools.contract';

export const schoolListItem = (slug: string, overrides: Partial<MedSchoolListItemDto> = {}): MedSchoolListItemDto => ({
  slug,
  name: `${slug} University School of Medicine`,
  shortName: slug,
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  reported: { source: 'CYCLETRACK', count: 120 },
  latest: null,
  accounted: null,
  ...overrides,
});
