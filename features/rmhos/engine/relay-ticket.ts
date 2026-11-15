import { api } from '@/lib/contract/client';
import { rmhosSessionApi } from './rmhos.contract';

export type RelayTicket = { url: string; ticket: string };

/**
 * A fresh relay URL and ticket from the session endpoint, or null when networking is off. Called
 * when the machine is about to be built (the ticket is good for 60 s of first use), not at page
 * load. A plain module, not the hook: see the useEffect + /api ratchet.
 */
export async function fetchRelayTicket(): Promise<RelayTicket | null> {
  const fresh = await api(rmhosSessionApi);
  return fresh.net.enabled ? { url: fresh.net.url, ticket: fresh.net.ticket } : null;
}

/**
 * The ticket of the machine that is actually running, shared with the status poll. A run keeps
 * the ticket it fetched to itself and publishes it only once its machine exists and the run is
 * still the newest one, so a cancelled run whose fetch resolves late (out of order) can never
 * overwrite the live machine's ticket.
 */
export function createTicketHolder() {
  let current: RelayTicket | null = null;
  let newest = 0;
  return {
    get current(): RelayTicket | null {
      return current;
    },
    begin(fetcher: () => Promise<RelayTicket | null> = fetchRelayTicket) {
      const id = ++newest;
      let mine: RelayTicket | null = null;
      return {
        /** What createVm calls: fetch, and keep the answer in this run. */
        async fetch(): Promise<RelayTicket | null> {
          mine = await fetcher();
          return mine;
        },
        /** Call after createVm resolved for a run that was not cancelled. False if superseded. */
        publish(): boolean {
          if (id !== newest) return false;
          current = mine;
          return true;
        },
        /** Cleanup: forget the published ticket if it is this run's. */
        release(): void {
          if (id === newest) current = null;
        },
      };
    },
  };
}
