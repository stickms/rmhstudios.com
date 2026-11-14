/**
 * Contract for /api/rmhos/session. Client-safe: no zod, no server import.
 */
import { endpoint } from '@/lib/contract/endpoint';

export type RmhosNet = { enabled: true; url: string; ticket: string } | { enabled: false };

export interface RmhosSession {
  linuxUser: string;
  net: RmhosNet;
}

/** The Linux username for the signed-in account and a short-lived relay ticket. */
export const rmhosSessionApi = endpoint<{ res: RmhosSession }>()({
  method: 'GET',
  path: '/api/rmhos/session',
});
