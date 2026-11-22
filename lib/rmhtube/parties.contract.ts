/** Contracts for the scheduled watch-party endpoints. Client-safe: types only, no zod at runtime. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { scheduleBody, updatePartyBody } from '@/lib/rmhtube/parties-schema';

export interface PartyPerson {
  id: string;
  name: string | null;
  image: string | null;
}

export interface PartyDTO {
  roomId: string;
  name: string;
  description: string | null;
  /** ISO instant (UTC); the page shows it in the viewer's zone. */
  scheduledFor: string;
  isPublic: boolean;
  maxMembers: number;
  host: PartyPerson;
  goingCount: number;
  /** At most the first five going, never a full list. */
  firstGoing: PartyPerson[];
  viewerGoing: boolean;
  viewerIsHost: boolean;
  /** The host cancelled it or the reminder job closed it: no longer joinable. */
  closed: boolean;
}

export const listPartiesApi = endpoint<{
  res: {
    parties: PartyDTO[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhtube/parties',
});

export const schedulePartyApi = endpoint<{
  body: z.infer<typeof scheduleBody>;
  res: {
    party: PartyDTO;
  };
}>()({
  method: 'POST',
  path: '/api/rmhtube/parties',
});

export const getPartyApi = endpoint<{
  res: {
    party: PartyDTO;
  };
}>()({
  method: 'GET',
  path: '/api/rmhtube/parties/$roomId',
});

export const updatePartyApi = endpoint<{
  body: z.infer<typeof updatePartyBody>;
  res: {
    party: PartyDTO;
  };
}>()({
  method: 'PATCH',
  path: '/api/rmhtube/parties/$roomId',
});

export const cancelPartyApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhtube/parties/$roomId',
});

export const goingApi = endpoint<{
  res: {
    party: PartyDTO;
  };
}>()({
  method: 'PUT',
  path: '/api/rmhtube/parties/$roomId/rsvp',
});

export const notGoingApi = endpoint<{
  res: {
    party: PartyDTO;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhtube/parties/$roomId/rsvp',
});

/** The calendar file for a party (a route file, not JSON). */
export const partyIcsPath = (roomId: string): string => `/api/rmhtube/parties/${encodeURIComponent(roomId)}/ics`;
