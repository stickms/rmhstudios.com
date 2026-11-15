/**
 * Contract for /api/rmhos/session. Client-safe: no zod, no server import.
 */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * `reason: 'not-eligible'` means networking is on for the site but this account does not qualify
 * (RMHOS_NET_ACCESS members/verified, or too new); absent, networking is simply off.
 */
export type RmhosNetOffReason = 'not-eligible';

export type RmhosNet =
  | { enabled: true; url: string; ticket: string }
  | { enabled: false; reason?: RmhosNetOffReason };

export interface RmhosSession {
  linuxUser: string;
  net: RmhosNet;
}

/** The Linux username for the signed-in account and a short-lived relay ticket. */
export const rmhosSessionApi = endpoint<{ res: RmhosSession }>()({
  method: 'GET',
  path: '/api/rmhos/session',
});
