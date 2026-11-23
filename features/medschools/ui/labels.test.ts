import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string }) => o.defaultValue,
  }),
}));

import { useMedLabels } from './labels';

describe('useMedLabels', () => {
  const l = useMedLabels();
  it('labels every event type', () => {
    expect(l.eventLabel('INTERVIEW')).toBe('Interview invite');
    expect(l.eventLabel('HOLD')).toBe('Hold');
    expect(l.eventLabel('WITHDRAWN')).toBe('Withdrawn');
  });
  it('labels programs, null as not reported', () => {
    expect(l.programLabel(null)).toBe('Program not reported');
    expect(l.programLabel('REG')).toBe('MD / DO');
    expect(l.programLabel('PHD')).toBe('MD-PhD / DO-PhD');
  });
  it('labels the filter by degree', () => {
    expect(l.programFilterLabel('ALL')).toBe('All programs');
    expect(l.programFilterLabel('REG', 'DO')).toBe('DO');
    expect(l.programFilterLabel('PHD', 'MD')).toBe('MD-PhD');
    expect(l.programFilterLabel('PHD', 'DO')).toBe('DO-PhD');
    expect(l.programFilterLabel('NONE')).toBe('Program not reported');
  });
  it('source names are proper nouns', () => {
    expect(l.sourceName('SDN')).toBe('Student Doctor Network');
  });
});
