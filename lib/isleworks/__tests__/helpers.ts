/**
 * Shared test scaffolding for the Isleworks suites.
 *
 * Kept out of the test files themselves so both suites unlock the board the same
 * way — a test that quietly unlocks land differently is a test measuring a
 * different game.
 */

import { PARCEL_SIZE, parcelsAcross } from '../grid';
import { unlockParcel } from '../city';
import type { CityState } from '../types';

export { footprintTiles, index } from '../grid';

/** Buy the whole island, so a test can place anywhere without a treasury dance. */
export function unlockAllForTest(city: CityState): void {
  const across = parcelsAcross(city.width);
  const down = Math.ceil(city.height / PARCEL_SIZE);
  for (let parcel = 0; parcel < across * down; parcel++) unlockParcel(city, parcel);
}
