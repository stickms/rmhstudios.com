'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Smile, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { StatusBadge } from './StatusBadge';
import {
  STATUS_PRESETS,
  STATUS_MAX_TEXT,
  STATUS_MAX_EMOJI,
  type UserStatus,
  type StatusExpiresIn,
} from '@/lib/profile/status';

type ExpiryChoice = StatusExpiresIn | 'none';

const EXPIRY_OPTIONS: { value: ExpiryChoice; key: string; label: string }[] = [
  { value: 'none', key: 'expiry-none', label: "Don't clear" },
  { value: '30m', key: 'expiry-30m', label: '30 min' },
  { value: '1h', key: 'expiry-1h', label: '1 hour' },
  { value: 'today', key: 'expiry-today', label: 'Today' },
];

/**
 * StatusEditor — own-profile control for the custom status (§10). Shows the
 * current status (tap to edit) or a "Set a status" button, and a bottom-sheet
 * editor (the G1 Sheet) with emoji + text, quick presets, and an expiry
 * choice. Keeps the displayed status in local state so it updates without a
 * full profile reload.
 */
export function StatusEditor({ initial }: { initial: UserStatus | null }) {
  const { t } = useTranslation('c-status');
  const [status, setStatus] = useState<UserStatus | null>(initial);
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [expiresIn, setExpiresIn] = useState<ExpiryChoice>('none');
  const [busy, setBusy] = useState(false);

  function openEditor() {
    setEmoji(status?.emoji ?? '');
    setText(status?.text ?? '');
    setExpiresIn('none');
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/profile/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emoji: emoji || null,
          text: text || null,
          expiresIn: expiresIn === 'none' ? null : expiresIn,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = (await res.json()) as { status: UserStatus | null };
      setStatus(data.status);
      setOpen(false);
      toast.success(t('saved', { defaultValue: 'Status updated' }));
    } catch {
      toast.error(t('save-error', { defaultValue: "Couldn't update your status" }));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const res = await fetch('/api/profile/status', { method: 'DELETE' });
      if (!res.ok) throw new Error('clear failed');
      setStatus(null);
      setOpen(false);
      toast.success(t('cleared', { defaultValue: 'Status cleared' }));
    } catch {
      toast.error(t('save-error', { defaultValue: "Couldn't update your status" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {status ? (
        <button
          type="button"
          onClick={openEditor}
          className="group inline-flex max-w-full items-center"
          aria-label={t('edit-status', { defaultValue: 'Edit your status' })}
        >
          <StatusBadge status={status} className="group-hover:border-site-border-bright" />
        </button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openEditor}
          className="text-site-text-muted"
        >
          <Smile className="h-4 w-4" aria-hidden />
          {t('set-status', { defaultValue: 'Set a status' })}
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('title', { defaultValue: 'Set a status' })}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, STATUS_MAX_EMOJI))}
                placeholder="🎮"
                aria-label={t('emoji', { defaultValue: 'Emoji' })}
                className="w-16 text-center text-lg"
              />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, STATUS_MAX_TEXT))}
                placeholder={t('placeholder', { defaultValue: "What's up?" })}
                aria-label={t('status-text', { defaultValue: 'Status' })}
                maxLength={STATUS_MAX_TEXT}
                className="flex-1"
              />
            </div>
            <p className="text-end text-xs text-site-text-dim">
              {text.length}/{STATUS_MAX_TEXT}
            </p>

            <div className="flex flex-wrap gap-2">
              {STATUS_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setEmoji(p.emoji);
                    setText(t(p.key, { defaultValue: p.text }));
                  }}
                  className="glass-fill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-site-text hover:border-site-border-bright"
                >
                  <span aria-hidden>{p.emoji}</span>
                  {t(p.key, { defaultValue: p.text })}
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-site-text-muted">
                {t('clear-after', { defaultValue: 'Clear after' })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setExpiresIn(o.value)}
                    aria-pressed={expiresIn === o.value}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm transition-colors',
                      expiresIn === o.value
                        ? 'bg-site-accent text-site-accent-fg'
                        : 'glass-fill text-site-text-muted hover:border-site-border-bright',
                    )}
                  >
                    {t(o.key, { defaultValue: o.label })}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter>
            {status ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clear}
                disabled={busy}
                className="text-site-danger"
              >
                <X className="h-4 w-4" aria-hidden />
                {t('clear', { defaultValue: 'Clear status' })}
              </Button>
            ) : null}
            <Button type="button" variant="accent" onClick={save} loading={busy}>
              {t('save', { defaultValue: 'Save' })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
