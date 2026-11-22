import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useInvalidateAway } from '@/components/messages/useAway';
import { addDays, dayOf, isValidTimeZone } from '@/lib/calendar/tz';
import { api, errorField } from '@/lib/contract/client';
import { putAwayApi, type OwnAway } from '@/lib/messages/away.contract';
import { AWAY_BODY_MAX, AWAY_MAX_DAYS } from '@/lib/messages/away';
import { toast } from '@/lib/toast';

/** The member's time zone, from the browser; UTC where it cannot be read. */
function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * "Set an away message": the text people get once, the days it covers (in the member's time zone) and whether to
 * also show "Away until ..." on the profile. Editing keeps the period, so nobody is answered twice.
 */
export function AwayMessageDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: OwnAway | null;
}) {
  const { t } = useTranslation('away-message');
  const invalidate = useInvalidateAway();
  const [tz] = useState(() => current?.tz ?? browserTimeZone());
  const today = dayOf(Date.now(), tz);
  const [body, setBody] = useState(current?.body ?? '');
  const [startDay, setStartDay] = useState(current && current.startDay > today ? current.startDay : '');
  const [endDay, setEndDay] = useState(current?.endDay ?? addDays(today, 7));
  const [showOnProfile, setShowOnProfile] = useState(current?.showOnProfile ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api(putAwayApi, { body: { body: body.trim(), startDay: startDay || null, endDay, tz, showOnProfile } }),
    onSuccess: () => {
      void invalidate();
      toast.success(t('saved', { defaultValue: 'Away message saved' }));
      onOpenChange(false);
    },
    onError: (e) => {
      const code = errorField(e, 'code');
      if (code === 'too-far') {
        setError(
          t('error-too-far', {
            days: AWAY_MAX_DAYS,
            count: Number(AWAY_MAX_DAYS),
            defaultValue_one: 'Choose an end date within {{days}} day.',
            defaultValue: 'Choose an end date within {{days}} days.',
          }),
        );
      } else if (code === 'ended' || code === 'end-before-start') {
        setError(t('error-dates', { defaultValue: 'The end date must be today or later, and not before the start.' }));
      } else {
        setError(t('error-generic', { defaultValue: 'Could not save your away message. Try again.' }));
      }
    },
  });

  const valid = body.trim().length > 0 && endDay >= today && (!startDay || startDay <= endDay);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialog-title', { defaultValue: 'Away message' })}</DialogTitle>
          <DialogDescription>
            {t('dialog-description', {
              defaultValue:
                'People in your accepted conversations get this once while you are away. Group chats and message requests are not answered.',
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (valid && !save.isPending) save.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="away-body" className="t-label">
              {t('body-label', { defaultValue: 'Message' })}
            </label>
            <Textarea
              id="away-body"
              value={body}
              maxLength={AWAY_BODY_MAX}
              rows={4}
              autoFocus
              aria-describedby="away-body-count"
              onChange={(e) => setBody(e.target.value)}
            />
            <p id="away-body-count" className="t-meta">{`${body.length} / ${AWAY_BODY_MAX}`}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="away-start" className="t-label">
                {t('start-label', { tz, defaultValue: 'From (optional, {{tz}})' })}
              </label>
              <Input
                id="away-start"
                type="date"
                value={startDay}
                min={today}
                max={endDay}
                onChange={(e) => setStartDay(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="away-end" className="t-label">
                {t('end-label', { tz, defaultValue: 'Until ({{tz}})' })}
              </label>
              <Input
                id="away-end"
                type="date"
                value={endDay}
                min={today}
                max={addDays(today, AWAY_MAX_DAYS)}
                required
                onChange={(e) => setEndDay(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="away-profile" className="t-body">
              {t('profile-label', { defaultValue: 'Also show "Away until …" on my profile' })}
            </label>
            <Switch id="away-profile" checked={showOnProfile} onCheckedChange={setShowOnProfile} />
          </div>
          {error && (
            <p className="t-body text-site-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" disabled={!valid || save.isPending}>
              {t('save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
