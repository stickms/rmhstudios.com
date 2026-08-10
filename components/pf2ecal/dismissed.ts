'use client';

/**
 * Announcements you have read, hidden on this device only.
 *
 * The board is shared and tiny — five people, one notice board — so deleting is
 * a real and destructive act: it takes the note away from everyone, including
 * the person who has not opened the page yet. "I have read this" is a different
 * statement entirely, and it belongs to the reader rather than to the table.
 *
 * Hence localStorage rather than a row. There is no per-person state anywhere
 * else in this feature, and adding a `Pf2eAnnouncementRead` table to record
 * that Sam scrolled past a note would be a schema, a migration, an endpoint and
 * a sync path for something that does not survive a reinstall and does not need
 * to. The cost of the local version is that dismissing on your phone does not
 * dismiss on your laptop, which for a notice board is the correct amount of
 * wrong.
 *
 * The stored ids are PRUNED against what the board is actually showing, every
 * time the set is read. Without that the list grows forever — a dismissed note
 * that is later deleted leaves its id behind, and after a year the key is a
 * list of ids for rows that no longer exist.
 */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'pf2ecal-dismissed';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Private mode, a quota error, or something else's key at this name.
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // A dismissal that cannot be saved still applies for this visit.
  }
}

export interface DismissedState {
  /** Ids hidden on this device. Empty until after mount — see below. */
  dismissed: Set<string>;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  restoreAll: () => void;
}

/**
 * `liveIds` is what the board currently holds; anything stored that is not in
 * it has been deleted upstream and is dropped.
 */
export function useDismissedAnnouncements(liveIds: string[]): DismissedState {
  // Empty on the server AND on the first client render. Reading storage in the
  // initialiser would hide a note during hydration that the server rendered
  // visible, which React reports as a mismatch and repairs by throwing the tree
  // away. One frame of showing a note you have already read is the cheaper bug.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(new Set(read()));
  }, []);

  // Prune against the live board. Depends on the JOINED ids rather than the
  // array so a re-render with an equal-but-new array does not re-run this.
  const liveKey = liveIds.join(',');
  useEffect(() => {
    const live = new Set(liveKey ? liveKey.split(',') : []);
    setDismissed((current) => {
      const kept = [...current].filter((id) => live.has(id));
      if (kept.length === current.size) return current;
      write(kept);
      return new Set(kept);
    });
  }, [liveKey]);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      if (current.has(id)) return current;
      const next = new Set(current).add(id);
      write([...next]);
      return next;
    });
  }, []);

  const restore = useCallback((id: string) => {
    setDismissed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      write([...next]);
      return next;
    });
  }, []);

  const restoreAll = useCallback(() => {
    setDismissed(new Set());
    write([]);
  }, []);

  return { dismissed, dismiss, restore, restoreAll };
}
