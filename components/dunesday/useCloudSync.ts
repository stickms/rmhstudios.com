'use client';

/**
 * Opt-in cloud sync for the plan — what the calendar subscription, RSS feed
 * and Discord posts read from.
 *
 * The browser keeps `{ feedId, token }` in its own localStorage slot. Once on,
 * every change to the plan is saved (debounced), so a ticked-off film reaches
 * the calendar, the feed and the Discord channel without another click.
 *
 * `#sync=<feedId>.<token>` opens the same plan on another device: the token is
 * the edit credential, which is why the UI that copies that link says so.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DunesdayState } from '@/lib/dunesday/state';
import { TOKEN_HEADER } from '@/lib/dunesday/sync-schema';

const SLOT = 'dunesday:sync';
const DEBOUNCE_MS = 1500;

export interface SyncSlot {
  feedId: string;
  token: string;
}

export interface DiscordView {
  webhook: string | null;
  daily: boolean;
  progress: boolean;
  name: string | null;
}

export type SyncStatus = 'off' | 'saving' | 'saved' | 'error';

function zone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function readSlot(): SyncSlot | null {
  try {
    const raw = localStorage.getItem(SLOT);
    const v = raw ? (JSON.parse(raw) as Partial<SyncSlot>) : null;
    return v && typeof v.feedId === 'string' && typeof v.token === 'string'
      ? { feedId: v.feedId, token: v.token }
      : null;
  } catch {
    return null;
  }
}

function writeSlot(slot: SyncSlot | null) {
  try {
    if (slot) localStorage.setItem(SLOT, JSON.stringify(slot));
    else localStorage.removeItem(SLOT);
  } catch {
    // Storage blocked: sync still works for this visit.
  }
}

export function useCloudSync(
  state: DunesdayState,
  ready: boolean,
  replace: (next: unknown) => void,
  onLost: () => void,
) {
  const [slot, setSlot] = useState<SyncSlot | null>(null);
  const [status, setStatus] = useState<SyncStatus>('off');
  const [discord, setDiscord] = useState<DiscordView | null>(null);
  const [restored, setRestored] = useState(false);
  const skipNextSave = useRef(true);
  const lostRef = useRef(onLost);
  lostRef.current = onLost;

  const headers = useCallback(
    (s: SyncSlot) => ({ 'Content-Type': 'application/json', [TOKEN_HEADER]: s.token }),
    [],
  );

  const lose = useCallback(() => {
    writeSlot(null);
    setSlot(null);
    setDiscord(null);
    setStatus('off');
    lostRef.current();
  }, []);

  const load = useCallback(
    async (s: SyncSlot, adopt: boolean) => {
      const res = await fetch(`/api/dunesday/sync/${s.feedId}`, { headers: headers(s) });
      if (res.status === 404) {
        lose();
        return;
      }
      if (!res.ok) return;
      const view = (await res.json()) as { state: unknown; discord: DiscordView };
      setDiscord(view.discord);
      if (adopt) {
        skipNextSave.current = true;
        replace(view.state);
        setRestored(true);
      }
    },
    [headers, lose, replace],
  );

  // On mount: pick up a `#sync=` link (another device), else the stored slot.
  useEffect(() => {
    if (!ready) return;
    const match = window.location.hash.match(/sync=([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16,100})/);
    let s = readSlot();
    let adopt = false;
    if (match) {
      s = { feedId: match[1], token: match[2] };
      writeSlot(s);
      adopt = true;
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (!s) return;
    setSlot(s);
    setStatus('saved');
    void load(s, adopt);
    // Mount-only: `ready` flips once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save on change, debounced.
  useEffect(() => {
    if (!slot) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setStatus('saving');
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/dunesday/sync/${slot.feedId}`, {
          method: 'PUT',
          headers: headers(slot),
          body: JSON.stringify({ state, timeZone: zone() }),
        });
        if (res.status === 404) return lose();
        setStatus(res.ok ? 'saved' : 'error');
      } catch {
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [state, slot, headers, lose]);

  const enable = useCallback(async (): Promise<boolean> => {
    setStatus('saving');
    try {
      const res = await fetch('/api/dunesday/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, timeZone: zone() }),
      });
      if (!res.ok) {
        setStatus('error');
        return false;
      }
      const s = (await res.json()) as SyncSlot;
      writeSlot(s);
      skipNextSave.current = true;
      setSlot(s);
      setStatus('saved');
      setDiscord({ webhook: null, daily: true, progress: true, name: null });
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, [state]);

  const disable = useCallback(async () => {
    if (!slot) return;
    try {
      await fetch(`/api/dunesday/sync/${slot.feedId}`, {
        method: 'DELETE',
        headers: headers(slot),
      });
    } finally {
      writeSlot(null);
      setSlot(null);
      setDiscord(null);
      setStatus('off');
    }
  }, [slot, headers]);

  const saveDiscord = useCallback(
    async (input: {
      webhookUrl?: string | null;
      daily: boolean;
      progress: boolean;
      name: string | null;
    }) => {
      if (!slot) return { ok: false, error: 'Sync is off.' };
      const res = await fetch(`/api/dunesday/sync/${slot.feedId}/discord`, {
        method: 'PUT',
        headers: headers(slot),
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        discord?: DiscordView;
      };
      if (!res.ok) return { ok: false, error: data.error ?? 'Could not save.' };
      if (data.discord) setDiscord(data.discord);
      return { ok: true };
    },
    [slot, headers],
  );

  const testDiscord = useCallback(
    async (webhookUrl?: string) => {
      if (!slot) return { ok: false, error: 'Sync is off.' };
      const res = await fetch(`/api/dunesday/sync/${slot.feedId}/discord`, {
        method: 'POST',
        headers: headers(slot),
        body: JSON.stringify({ webhookUrl: webhookUrl || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true }
        : { ok: false, error: data.error ?? 'Discord rejected the message.' };
    },
    [slot, headers],
  );

  return { slot, status, discord, restored, enable, disable, saveDiscord, testDiscord };
}

export type CloudSync = ReturnType<typeof useCloudSync>;
