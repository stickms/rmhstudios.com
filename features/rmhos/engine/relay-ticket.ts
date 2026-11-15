import { api } from '@/lib/contract/client';
import { rmhosSessionApi } from './rmhos.contract';

/**
 * A fresh relay URL and ticket from the session endpoint, or null when networking is off. Called
 * when the machine is about to be built (the ticket is good for 60 s of first use), not at page
 * load. A plain module, not the hook: see the useEffect + /api ratchet.
 */
export async function fetchRelayTicket(): Promise<{ url: string; ticket: string } | null> {
  const fresh = await api(rmhosSessionApi);
  return fresh.net.enabled ? { url: fresh.net.url, ticket: fresh.net.ticket } : null;
}
