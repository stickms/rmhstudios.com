'use client';

/** Opt-in birthday (G1) for Settings → Profile. Month and day only. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { apiJson } from '@/components/economy-plus/api';
import { isValidMonthDay } from '@/lib/gifting/birthday';

export default function BirthdaySettings() {
  const { t } = useTranslation('f-gifting');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiJson<{ birthday: { month: number; day: number } | null }>('/api/birthday')
      .then(({ birthday }) => {
        if (!birthday) return;
        setMonth(String(birthday.month));
        setDay(String(birthday.day));
        setSaved(true);
      })
      .catch(() => {});
  }, []);

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, i, 1)),
    ),
  );
  const valid = month !== '' && day !== '' && isValidMonthDay(Number(month), Number(day));

  async function save() {
    setBusy(true);
    try {
      await apiJson('/api/birthday', {
        method: 'PUT',
        body: { month: Number(month), day: Number(day) },
      });
      setSaved(true);
      toast.success(t('birthday-saved', { defaultValue: 'Birthday saved' }));
    } catch {
      toast.error(t('birthday-error', { defaultValue: "Couldn't save your birthday" }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiJson('/api/birthday', { method: 'DELETE' });
      setMonth('');
      setDay('');
      setSaved(false);
      toast.success(t('birthday-removed', { defaultValue: 'Birthday removed' }));
    } catch {
      toast.error(t('birthday-error', { defaultValue: "Couldn't save your birthday" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="birthday-h" className="glass-pane space-y-3 p-4">
      <h2 id="birthday-h" className="flex items-center gap-2 font-display text-base font-semibold">
        <Cake className="size-4" aria-hidden />
        {t('birthday-title', { defaultValue: 'Birthday' })}
      </h2>
      <p className="text-sm text-site-text-muted">
        {t('birthday-desc', {
          defaultValue:
            'Optional. Share the day and month (never the year): your followers get one nudge and your profile gets confetti that day. Anyone signed in can schedule you a gift for it.',
        })}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label={t('birthday-month', { defaultValue: 'Month' })}
          containerClassName="w-40"
        >
          <option value="">{t('birthday-month', { defaultValue: 'Month' })}</option>
          {monthNames.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label={t('birthday-day', { defaultValue: 'Day' })}
          containerClassName="w-28"
        >
          <option value="">{t('birthday-day', { defaultValue: 'Day' })}</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {i + 1}
            </option>
          ))}
        </Select>
        <Button variant="accent" size="sm" disabled={!valid} loading={busy} onClick={save}>
          {t('birthday-save', { defaultValue: 'Save' })}
        </Button>
        {saved ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
            {t('birthday-remove', { defaultValue: 'Stop sharing' })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
