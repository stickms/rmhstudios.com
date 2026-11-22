import { describe, it, expectTypeOf } from 'vitest';
import type { MedEventType, MedResidence, NormalizedCount, NormalizedEvent } from './types';

// These pins are enforced by `tsc` (`pnpm typecheck`), not at vitest runtime:
// vitest strips types, so a failure here shows up as a type error. Adding a
// person field to either shape breaks the build.
describe('anonymization type pin', () => {
  it('NormalizedEvent has exactly the anonymous keys', () => {
    expectTypeOf<keyof NormalizedEvent>().toEqualTypeOf<
      'source' | 'schoolKey' | 'cycleYear' | 'program' | 'eventType' | 'occurredAt' | 'dedupeHash' | 'inState'
    >();
  });
  it('NormalizedCount has exactly the aggregate keys', () => {
    expectTypeOf<keyof NormalizedCount>().toEqualTypeOf<
      'source' | 'schoolKey' | 'program' | 'cycleYear' | 'date' | 'eventType' | 'count' | 'contributors'
    >();
  });

  it('MedEventType accepts WITHDRAWN and HOLD', () => {
    expectTypeOf<'WITHDRAWN'>().toExtend<MedEventType>();
    expectTypeOf<'HOLD'>().toExtend<MedEventType>();
  });
  it('MedResidence is the three populations', () => {
    expectTypeOf<MedResidence>().toEqualTypeOf<'GLOBAL' | 'IN_STATE' | 'OUT_OF_STATE'>();
  });
});
