/**
 * Contracts for tournament check-in (s04-03). Client-safe: types only.
 * Errors carry `TournamentError`'s message and status.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { CheckInSettingsInput, HostCheckInInput } from '@/lib/tournaments/tournament-schema';

/** The signed-in entrant checks themselves in (the window must be open). Idempotent. */
export const checkInApi = endpoint<{
  params: { id: string };
  res: { ok: true };
}>()({ method: 'POST', path: '/api/tournaments/$id/checkin' });

/** The host (or an admin) checks one entrant in by hand, or undoes it, before the start. */
export const hostCheckInApi = endpoint<{
  params: { id: string };
  body: HostCheckInInput;
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/tournaments/$id/checkin' });

/** The host (or an admin) sets the check-in window while registration is open; null turns it off. */
export const checkInSettingsApi = endpoint<{
  params: { id: string };
  body: CheckInSettingsInput;
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/tournaments/$id/checkin' });
