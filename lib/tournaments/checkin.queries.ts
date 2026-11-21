/**
 * The writes the tournament check-in panel makes (s04-03). Client-safe: contracts
 * only. Kept beside the contract so the panel holds no endpoint calls of its own
 * (redesign audit B4), and the page refetches the tournament after each.
 */
import { api } from '@/lib/contract/client';
import type { BodyOf } from '@/lib/contract/endpoint';
import { checkInApi, checkInSettingsApi, hostCheckInApi } from '@/lib/tournaments/checkin.contract';

/** The signed-in entrant checks themself in. */
export const checkInSelf = (tournamentId: string) => api(checkInApi, { params: { id: tournamentId } });

/** The host sets (or turns off, with `null`) the check-in window. */
export const setCheckInWindow = (
  tournamentId: string,
  checkInMinutes: BodyOf<typeof checkInSettingsApi>['checkInMinutes'],
) =>
  api(checkInSettingsApi, { params: { id: tournamentId }, body: { checkInMinutes } });

/** The host checks an entrant in by hand, or undoes it. */
export const setEntrantCheckIn = (tournamentId: string, userId: string, checkedIn: boolean) =>
  api(hostCheckInApi, { params: { id: tournamentId }, body: { userId, checkedIn } });
