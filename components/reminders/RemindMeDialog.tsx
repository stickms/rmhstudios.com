'use client';

/**
 * "Remind me about this" (plan U7). Lazy-loaded by the menus that offer it, so
 * it costs nothing until someone picks the item.
 *
 * Presets resolve to an absolute instant in the viewer's own clock before they
 * are sent — the server never has to know the viewer's timezone.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlarmClock, CalendarClock, Moon, Sun, Timer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MenuItem } from '@/components/ui/menu';
import { resolvePreset, type ReminderKind, type ReminderPreset } from '@/lib/reminders/shared';

export interface RemindTarget {
  kind: ReminderKind;
  targetId: string;
  /** What the notification will say ("Post by @ana", "Spring tournament"). */
  label: string;
  /** Same-site path the reminder opens. */
  url: string;
}

/** `YYYY-MM-DDTHH:mm` in local time, for `<input type="datetime-local">`. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindMeDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RemindTarget;
}) {
  const { t } = useTranslation('c-saves');
  const [custom, setCustom] = useState(() => toLocalInput(resolvePreset('tomorrow')));
  const [saving, setSaving] = useState(false);

  async function save(at: Date) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...target, remindAt: at.toISOString() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || t('remind-error', { defaultValue: "Couldn't set the reminder" }));
        return;
      }
      const when = at.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
      toast.success(t('remind-set', { defaultValue: 'Reminder set for {{when}}', when }));
      onOpenChange(false);
    } catch {
      toast.error(t('remind-error', { defaultValue: "Couldn't set the reminder" }));
    } finally {
      setSaving(false);
    }
  }

  const presets: Array<{ id: ReminderPreset; icon: typeof Timer; label: string }> = [
    { id: 'hour', icon: Timer, label: t('remind-hour', { defaultValue: 'In 1 hour' }) },
    { id: 'tonight', icon: Moon, label: t('remind-tonight', { defaultValue: 'Tonight' }) },
    {
      id: 'tomorrow',
      icon: Sun,
      label: t('remind-tomorrow', { defaultValue: 'Tomorrow morning' }),
    },
    { id: 'week', icon: CalendarClock, label: t('remind-week', { defaultValue: 'Next week' }) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-site-accent" aria-hidden />
            {t('remind-title', { defaultValue: 'Remind me' })}
          </DialogTitle>
          <DialogDescription className="truncate">{target.label}</DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-col"
          role="menu"
          aria-label={t('remind-presets', { defaultValue: 'Quick times' })}
        >
          {presets.map((p) => (
            <MenuItem
              key={p.id}
              icon={p.icon}
              disabled={saving}
              hint={resolvePreset(p.id).toLocaleString(undefined, {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              onSelect={() => void save(resolvePreset(p.id))}
            >
              {p.label}
            </MenuItem>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const at = new Date(custom);
            if (!Number.isNaN(at.getTime())) void save(at);
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-site-text-muted">
            {t('remind-pick', { defaultValue: 'Pick a time' })}
            <Input
              type="datetime-local"
              value={custom}
              min={toLocalInput(new Date())}
              onChange={(e) => setCustom(e.target.value)}
              className="mt-1"
            />
          </label>
          <Button type="submit" variant="accent" loading={saving}>
            {t('remind-save', { defaultValue: 'Set' })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
