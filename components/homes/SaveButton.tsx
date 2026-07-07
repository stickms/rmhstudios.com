'use client';

import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Listing } from '@/lib/homes/types';

interface SaveButtonProps {
  listing: Listing;
  saved: boolean;
  onChange?: (saved: boolean) => void;
  /** Compact icon-only variant for cards. */
  compact?: boolean;
}

/**
 * Heart toggle that saves/unsaves a listing. Optimistic: flips immediately and
 * rolls back on failure. Sends the full listing on save so the server stores a
 * self-contained snapshot.
 */
export function SaveButton({ listing, saved, onChange, compact }: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(saved);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const next = !isSaved;
    setIsSaved(next);
    setBusy(true);
    try {
      const res = next
        ? await fetch('/api/homes/saved-listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listing }),
          })
        : await fetch(`/api/homes/saved-listings?id=${encodeURIComponent(listing.id)}`, {
            method: 'DELETE',
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not update saved listings');
      }
      onChange?.(next);
    } catch (err) {
      setIsSaved(!next); // rollback
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isSaved}
        aria-label={isSaved ? 'Remove from saved' : 'Save listing'}
        className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className={`h-4 w-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isSaved}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
        isSaved
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          : 'border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover'
      }`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={`h-4 w-4 ${isSaved ? 'fill-rose-500 text-rose-500' : ''}`} />
      )}
      {isSaved ? 'Saved' : 'Save'}
    </button>
  );
}
