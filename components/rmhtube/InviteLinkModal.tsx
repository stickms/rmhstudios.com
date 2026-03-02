/**
 * InviteLinkModal — Create and share invite links for the room.
 *
 * Host and moderators can create invite links with configurable
 * expiration and max uses.
 */
'use client';

import { useState, useCallback } from 'react';
import { X, Link2, Copy, Check } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';

interface InviteLinkModalProps {
  roomId: string;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', value: '1h' },
  { label: '6 hours', value: '6h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: 'Never', value: 'never' },
];

const MAX_USES_OPTIONS = [
  { label: 'No limit', value: 0 },
  { label: '1 use', value: 1 },
  { label: '5 uses', value: 5 },
  { label: '10 uses', value: 10 },
  { label: '25 uses', value: 25 },
];

export default function InviteLinkModal({ roomId, onClose }: InviteLinkModalProps) {
  const [expiry, setExpiry] = useState('24h');
  const [maxUses, setMaxUses] = useState(0);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/rmhtube/${roomId}`;

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }, [shareUrl]);

  const handleCreateInvite = useCallback(() => {
    emit(C2S.ROOM_CREATE_INVITE, {
      expiresIn: expiry,
      maxUses,
    });
    onClose();
  }, [expiry, maxUses, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-(--rmhtube-accent)" />
            <h3 className="text-lg font-semibold text-(--rmhtube-text)">Invite to Room</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick share link */}
        <div className="mb-5">
          <label className="block text-xs font-medium mb-1.5 text-(--rmhtube-text-dim)">
            Room Link
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text-muted) outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="shrink-0 rounded-lg px-3 py-2 transition-colors bg-(--rmhtube-surface-hover) text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
              title="Copy link"
            >
              {copied ? (
                <Check className="h-4 w-4 text-(--rmhtube-success)" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Invite link settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-(--rmhtube-text-dim)">
              Expires After
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiry(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                    expiry === opt.value
                      ? 'border-(--rmhtube-accent) bg-(--rmhtube-accent-dim) text-(--rmhtube-accent)'
                      : 'border-(--rmhtube-border) text-(--rmhtube-text-muted) hover:border-(--rmhtube-border-bright)'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-(--rmhtube-text-dim)">
              Max Uses
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MAX_USES_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMaxUses(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                    maxUses === opt.value
                      ? 'border-(--rmhtube-accent) bg-(--rmhtube-accent-dim) text-(--rmhtube-accent)'
                      : 'border-(--rmhtube-border) text-(--rmhtube-text-muted) hover:border-(--rmhtube-border-bright)'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleCreateInvite}
          className="w-full mt-5 py-2.5 rounded-lg font-semibold text-white transition-colors bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
        >
          Create Invite Link
        </button>
      </div>
    </div>
  );
}
