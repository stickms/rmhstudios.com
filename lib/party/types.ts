/**
 * Party system — client-safe view types shared by the party bar UI, the
 * `useParty` hook, and the socket handler. Plain module (no `.server`).
 */

export interface PartyMemberView {
  userId: string;
  name: string | null;
  image: string | null;
  isLeader: boolean;
}

export interface PartyView {
  id: string;
  leaderId: string;
  members: PartyMemberView[];
  maxSize: number;
}

export interface PartyInviteMsg {
  partyId: string;
  from: { userId: string; name: string | null; image: string | null };
}

/** Emitted to every member when the leader queues a game. */
export interface PartyTicketMsg {
  game: string;
  roomId: string;
  /** Short-lived HMAC bearer token — pass in router state, never the URL. */
  token: string;
}
