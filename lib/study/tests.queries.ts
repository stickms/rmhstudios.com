/** Practice-test writes, kept out of the component so it owns UI state only (redesign audit B4). Client-safe. */
import { api, type ApiInput } from '@/lib/contract/client';
import { recordDeckTestApi } from '@/lib/study/tests.contract';

/** Save one finished practice test for the signed-in member. */
export function recordDeckTest(deckId: string, body: ApiInput<typeof recordDeckTestApi>['body']) {
  return api(recordDeckTestApi, { params: { id: deckId }, body });
}
