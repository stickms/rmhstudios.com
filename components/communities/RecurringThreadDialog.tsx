/**
 * s08-09 — the form for one recurring thread: title, body, flair, cadence, weekday or day of the month, time and
 * time zone. Text only. Save is the dialog's one ink primary; saving makes the editor the author.
 */
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { createRecurringApi, updateRecurringApi } from '@/lib/communities/recurring.contract';
import {
  BODY_MAX,
  MONTH_DAY_MAX,
  TITLE_MAX,
  fitsPost,
  parseTime,
  type Cadence,
  type RecurringThreadDTO,
} from '@/lib/communities/recurring';
import { isValidTimeZone } from '@/lib/calendar/tz';
import type { FlairDTO } from '@/lib/communities/plus';

function browserZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && isValidTimeZone(z) ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function RecurringThreadDialog({
  slug,
  thread,
  flairs,
  onClose,
  onSaved,
}: {
  slug: string;
  /** `null` adds a new thread; a row edits it. */
  thread: RecurringThreadDTO | null;
  flairs: FlairDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('recurring-threads');
  const refusalText = useRefusalText();
  const fmt = useLocaleFormat();
  const ids = useId();
  const [title, setTitle] = useState(thread?.title ?? '');
  const [body, setBody] = useState(thread?.body ?? '');
  const [flairId, setFlairId] = useState(thread?.flairId ?? '');
  const [cadence, setCadence] = useState<Cadence>(thread?.cadence ?? 'weekly');
  const [weekday, setWeekday] = useState(thread?.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(thread?.dayOfMonth ?? 1);
  const [time, setTime] = useState(thread?.time ?? '09:00');
  const [timeZone, setTimeZone] = useState(thread?.timeZone ?? browserZone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekdayName = (d: number) =>
    new Intl.DateTimeFormat(fmt.locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + d)));

  const save = async () => {
    setError(null);
    if (!title.trim()) {
      setError(
        t('error-title', {
          defaultValue: 'Add a title',
        }),
      );
      return;
    }
    if (!fitsPost(title, body)) {
      setError(
        t('error-length', {
          defaultValue: 'The title and body must fit one post (280 characters)',
        }),
      );
      return;
    }
    if (parseTime(time) === null) {
      setError(
        t('error-time', {
          defaultValue: 'Choose a time',
        }),
      );
      return;
    }
    if (!isValidTimeZone(timeZone.trim())) {
      setError(
        t('error-zone', {
          defaultValue: 'Use a time zone name such as Europe/London',
        }),
      );
      return;
    }
    const payload = {
      title: title.trim(),
      body: body.trim(),
      flairId: flairId || null,
      cadence,
      weekday: cadence === 'weekly' ? weekday : null,
      dayOfMonth: cadence === 'monthly' ? dayOfMonth : null,
      time,
      timeZone: timeZone.trim(),
    };
    setBusy(true);
    try {
      if (thread)
        await api(updateRecurringApi, {
          params: {
            slug,
            id: thread.id,
          },
          body: payload,
        });
      else
        await api(createRecurringApi, {
          params: {
            slug,
          },
          body: payload,
        });
      onSaved();
    } catch (err) {
      const message = refusalText.maybe(err);
      setError(
        message ||
          t('action-failed', {
            defaultValue: 'Could not save that',
          }),
      );
      if (!message)
        toast.error(
          t('action-failed', {
            defaultValue: 'Could not save that',
          }),
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {thread
              ? t('dialog-edit', {
                  defaultValue: 'Edit recurring thread',
                })
              : t('dialog-new', {
                  defaultValue: 'New recurring thread',
                })}
          </DialogTitle>
          <DialogDescription>
            {t('dialog-hint', {
              defaultValue: 'Posts as you, from your account, with the same rules as a post you write. Text only.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-title`}>
              {t('field-title', {
                defaultValue: 'Title',
              })}
            </Label>
            <Input id={`${ids}-title`} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-body`}>
              {t('field-body', {
                defaultValue: 'Body',
              })}
            </Label>
            <Textarea
              id={`${ids}-body`}
              value={body}
              rows={3}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {flairs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-flair`}>
                {t('field-flair', {
                  defaultValue: 'Flair',
                })}
              </Label>
              <Select id={`${ids}-flair`} value={flairId} onChange={(e) => setFlairId(e.target.value)}>
                <option value="">
                  {t('no-flair', {
                    defaultValue: 'No flair',
                  })}
                </option>
                {flairs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-cadence`}>
              {t('field-cadence', {
                defaultValue: 'Repeats',
              })}
            </Label>
            <Select
              id={`${ids}-cadence`}
              value={cadence}
              onChange={(e) => setCadence(e.target.value === 'monthly' ? 'monthly' : 'weekly')}
            >
              <option value="weekly">
                {t('cadence-weekly-option', {
                  defaultValue: 'Weekly',
                })}
              </option>
              <option value="monthly">
                {t('cadence-monthly-option', {
                  defaultValue: 'Monthly',
                })}
              </option>
            </Select>
          </div>
          {cadence === 'weekly' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-weekday`}>
                {t('field-weekday', {
                  defaultValue: 'Day of the week',
                })}
              </Label>
              <Select id={`${ids}-weekday`} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {weekdayName(d)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-day`}>
                {t('field-day', {
                  defaultValue: 'Day of the month',
                })}
              </Label>
              <Select id={`${ids}-day`} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>
                {Array.from(
                  {
                    length: MONTH_DAY_MAX,
                  },
                  (_, i) => i + 1,
                ).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-time`}>
              {t('field-time', {
                defaultValue: 'Time',
              })}
            </Label>
            <Input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-zone`}>
              {t('field-zone', {
                defaultValue: 'Time zone',
              })}
            </Label>
            <Input
              id={`${ids}-zone`}
              value={timeZone}
              maxLength={64}
              autoComplete="off"
              onChange={(e) => setTimeZone(e.target.value)}
            />
          </div>
          {error && (
            <p className="t-body text-site-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {t('save', {
              defaultValue: 'Save',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
