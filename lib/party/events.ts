/**
 * Party system — socket event names (shared by `hooks/useParty.ts` /
 * `components/party/PartyBar.tsx` and `server/socket-server/handlers/party.ts`).
 * Client-safe module (no server-only imports) so both bundles import the same
 * strings and they never drift.
 */

export const PARTY_C2S = {
  CREATE: 'party:create',
  INVITE: 'party:invite',
  ACCEPT: 'party:accept',
  LEAVE: 'party:leave',
  KICK: 'party:kick',
  TRANSFER: 'party:transfer',
  QUEUE: 'party:queue',
} as const;

export const PARTY_S2C = {
  /** Full party snapshot pushed to every member. */
  STATE: 'party:state',
  /** An inbound invite delivered to the invitee's sockets. */
  INVITED: 'party:invited',
  /** Single-use join ticket for a queued game (never put in the URL). */
  TICKET: 'party:ticket',
  /** Recoverable error surfaced to the acting socket. */
  ERROR: 'party:error',
  /** The party was disbanded (last member left / leader ended it). */
  DISBANDED: 'party:disbanded',
} as const;
