/**
 * "Remind me about this" (plan U7). Lazy-loaded by the menus that offer it, so
 * it costs nothing until someone picks the item.
 *
 * Presets resolve to an absolute instant in the viewer's own clock before they
 * are sent — the server never has to know the viewer's timezone.
 */

import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { AlarmClock, CalendarClock, Moon, Sun, Timer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MenuItem } from '@/components/ui/menu';
import { resolvePreset, type ReminderKind, type ReminderPreset } from '@/lib/reminders/shared';
import { api } from '@/lib/contract/client';
import { setReminderApi } from '@/lib/reminders/reminders.contract';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

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
  const fmt = useLocaleFormat();
  const { t } = useTranslation('c-saves');
  const refusalText = useRefusalText();
  const [custom, setCustom] = useState(() => toLocalInput(resolvePreset('tomorrow')));
  const [saving, setSaving] = useState(false);

  async function save(at: Date) {
    if (saving) return;
    setSaving(true);
    try {
      await api(setReminderApi, {
        body: {
          ...target,
          remindAt: at.toISOString(),
        },
      });
      const when = fmt.dateTime(at, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
      toast.success(
        t('remind-set', {
          defaultValue: 'Reminder set for {{when}}',
          when,
        }),
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ||
          t('remind-error', {
            defaultValue: "Couldn't set the reminder",
          }),
      );
    } finally {
      setSaving(false);
    }
  }

  const presets: Array<{
    id: ReminderPreset;
    icon: typeof Timer;
    label: string;
  }> = [
    {
      id: 'hour',
      icon: Timer,
      label: t('remind-hour', {
        defaultValue: 'In 1 hour',
      }),
    },
    {
      id: 'tonight',
      icon: Moon,
      label: t('remind-tonight', {
        defaultValue: 'Tonight',
      }),
    },
    {
      id: 'tomorrow',
      icon: Sun,
      label: t('remind-tomorrow', {
        defaultValue: 'Tomorrow morning',
      }),
    },
    {
      id: 'week',
      icon: CalendarClock,
      label: t('remind-week', {
        defaultValue: 'Next week',
      }),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-6 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-site-accent" aria-hidden />
            {t('remind-title', {
              defaultValue: 'Remind me',
            })}
          </DialogTitle>
          <DialogDescription className="truncate">{target.label}</DialogDescription>
        </DialogHeader>
        <div
          className="-mx-3 flex flex-col gap-1"
          role="menu"
          aria-label={t('remind-presets', {
            defaultValue: 'Quick times',
          })}
        >
          {presets.map((p) => (
            <MenuItem
              key={p.id}
              // A list in a dialog, not a dropdown panel that clips its rows: keep the row's own shape.
              className="min-h-11 rounded-site-sm"
              icon={p.icon}
              disabled={saving}
              hint={fmt.dateTime(resolvePreset(p.id), {
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
          className="flex items-end gap-3 border-t border-site-border pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            const at = new Date(custom);
            if (!Number.isNaN(at.getTime())) void save(at);
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-site-text-muted">
            {t('remind-pick', {
              defaultValue: 'Pick a time',
            })}
            <Input
              type="datetime-local"
              value={custom}
              min={toLocalInput(new Date())}
              onChange={(e) => setCustom(e.target.value)}
              className="w-full min-w-0"
            />
          </label>
          <Button type="submit" variant="default" loading={saving}>
            {t('remind-save', {
              defaultValue: 'Set',
            })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
