import {
  describe,
  it,
  expectTypeOf,
} from 'vitest';
import type {
  NormalizedCount,
  NormalizedEvent,
} from './types';

// These pins are enforced by `tsc` (`pnpm typecheck`), not at vitest runtime:
// vitest strips types, so a failure here shows up as a type error. Adding a
// person field to either shape breaks the build.
describe('anonymization type pin', () => {
  it('NormalizedEvent has exactly the anonymous keys', () => {
    expectTypeOf<
      keyof NormalizedEvent
    >().toEqualTypeOf<
      | 'source'
      | 'schoolKey'
      | 'cycleYear'
      | 'eventType'
      | 'occurredAt'
      | 'dedupeHash'
      | 'inState'
    >();
  });
  it('NormalizedCount has exactly the aggregate keys', () => {
    expectTypeOf<
      keyof NormalizedCount
    >().toEqualTypeOf<
      | 'source'
      | 'schoolKey'
      | 'program'
      | 'cycleYear'
      | 'date'
      | 'eventType'
      | 'count'
      | 'contributors'
    >();
  });
});
