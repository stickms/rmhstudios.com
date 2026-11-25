/**
 * "Edit jam" (s14-14): an admin changes a jam after creating it, within what its phase allows
 * (`lib/competitive/jam-edit.ts` is the rule; the server enforces it again inside the save). A field the phase
 * locks is shown read-only with the reason. The secret theme is never shown: before the start the field is blank
 * ("leave blank to keep it") and only a typed value is sent. Mounted fresh each time it opens, so a cancelled edit
 * never leaks into the next one.
 */
import { useId, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { updateJamApi } from '@/lib/competitive/jams.contract';
import { jamThemeVoteQuery } from '@/lib/competitive/jam-themes.queries';
import { editableFields, type FieldRule, type JamEditField, type LockReason } from '@/lib/competitive/jam-edit';

export interface EditableJamView {
  slug: string;
  title: string;
  description: string;
  /** Null before the start: the server never sends it. */
  theme: string | null;
  startsAt: string;
  submitEndsAt: string;
  ratingEndsAt: string;
  themeVoting: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO time as a `datetime-local` value in the browser's zone (minute precision, as the control has). */
function toInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface UpdateBody {
  title?: string;
  description?: string;
  theme?: string;
  startsAt?: Date;
  submitEndsAt?: Date;
  ratingEndsAt?: Date;
  themeVoteOpensAt?: Date;
}

export function JamEditDialog({ jam, onClose }: { jam: EditableJamView; onClose: () => void }) {
  const { t } = useTranslation('jam-editing');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const ids = useId();
  // A voting jam's vote-opening time is public (the vote view); it decides whether that time may still move.
  const voteView = useQuery({ ...jamThemeVoteQuery(jam.slug), enabled: jam.themeVoting, retry: false });
  const voteOpensAt = voteView.data?.view.opensAt ?? null;
  const voteLoading = jam.themeVoting && voteView.isPending;

  const rules = editableFields(
    {
      startsAt: new Date(jam.startsAt),
      submitEndsAt: new Date(jam.submitEndsAt),
      ratingEndsAt: new Date(jam.ratingEndsAt),
      themeVoting: jam.themeVoting,
      themeVoteOpensAt: voteOpensAt ? new Date(voteOpensAt) : null,
    },
    new Date(),
  );

  const initial = {
    title: jam.title,
    description: jam.description,
    startsAt: toInput(jam.startsAt),
    submitEndsAt: toInput(jam.submitEndsAt),
    ratingEndsAt: toInput(jam.ratingEndsAt),
  };
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [theme, setTheme] = useState('');
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [submitEndsAt, setSubmitEndsAt] = useState(initial.submitEndsAt);
  const [ratingEndsAt, setRatingEndsAt] = useState(initial.ratingEndsAt);
  // Empty until the member touches it; the stored opening time is what the field shows until then.
  const [opensAtDraft, setOpensAtDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opensAtValue = opensAtDraft ?? (voteOpensAt ? toInput(voteOpensAt) : '');

  const reasons: Record<LockReason, string> = {
    started: t('lock-started', { defaultValue: 'Locked: the jam has started' }),
    'voting-theme': t('lock-voting-theme', { defaultValue: 'Locked: the members choose this by vote' }),
    'vote-opened': t('lock-vote-opened', { defaultValue: 'Locked: voting has already opened' }),
    'no-vote': t('lock-no-vote', { defaultValue: 'Locked: this jam has no theme vote' }),
    ended: t('lock-ended', { defaultValue: 'Locked: the jam has ended' }),
  };
  const lockedLine = (field: JamEditField, rule: FieldRule) =>
    rule.mode === 'locked' ? (
      <p id={`${ids}-${field}-note`} className="t-meta">
        {reasons[rule.reason ?? 'started']}
      </p>
    ) : rule.mode === 'later' ? (
      <p id={`${ids}-${field}-note`} className="t-meta">
        {t('later-only', { defaultValue: 'Can only move later' })}
      </p>
    ) : null;

  const nothingEditable = Object.values(rules).every((r) => r.mode === 'locked');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: UpdateBody = {};
    if (rules.title.mode !== 'locked' && title.trim() !== initial.title) body.title = title.trim();
    if (rules.description.mode !== 'locked' && description.trim() !== initial.description) {
      body.description = description.trim();
    }
    if (rules.theme.mode !== 'locked' && theme.trim() !== '') body.theme = theme.trim();
    const dates: Array<[JamEditField, string, string]> = [
      ['startsAt', startsAt, initial.startsAt],
      ['submitEndsAt', submitEndsAt, initial.submitEndsAt],
      ['ratingEndsAt', ratingEndsAt, initial.ratingEndsAt],
    ];
    for (const [field, value, was] of dates) {
      if (rules[field].mode === 'locked' || value === was) continue;
      const at = new Date(value);
      if (Number.isNaN(at.getTime())) {
        toast.error(t('bad-date', { defaultValue: 'Enter a valid date and time' }));
        return;
      }
      if (field === 'startsAt') body.startsAt = at;
      else if (field === 'submitEndsAt') body.submitEndsAt = at;
      else body.ratingEndsAt = at;
    }
    if (rules.themeVoteOpensAt.mode !== 'locked' && opensAtDraft !== null && opensAtDraft !== '') {
      const at = new Date(opensAtDraft);
      if (Number.isNaN(at.getTime())) {
        toast.error(t('bad-date', { defaultValue: 'Enter a valid date and time' }));
        return;
      }
      body.themeVoteOpensAt = at;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await api(updateJamApi, { params: { slug: jam.slug }, body });
      toast.success(t('saved', { defaultValue: 'Jam updated' }));
      await queryClient.invalidateQueries({ queryKey: ['jams'] });
      onClose();
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('save-failed', { defaultValue: 'Could not update the jam' }));
    } finally {
      setBusy(false);
    }
  };

  const dateField = (
    field: 'startsAt' | 'submitEndsAt' | 'ratingEndsAt',
    label: string,
    value: string,
    set: (v: string) => void,
  ) => {
    const rule = rules[field];
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-${field}`}>{label}</Label>
        <Input
          id={`${ids}-${field}`}
          type="datetime-local"
          value={value}
          disabled={rule.mode === 'locked'}
          min={rule.mode === 'later' ? initial[field] : undefined}
          aria-describedby={rule.mode === 'free' ? undefined : `${ids}-${field}-note`}
          onChange={(e) => set(e.target.value)}
        />
        {lockedLine(field, rule)}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t('title', { defaultValue: 'Edit jam' })}</DialogTitle>
            <DialogDescription>
              {nothingEditable
                ? t('desc-ended', { defaultValue: 'This jam has ended, so nothing can change.' })
                : t('desc', {
                    defaultValue:
                      'Before the start everything can change. After it, only the description and later deadlines.',
                  })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-title`}>{t('f-title', { defaultValue: 'Title' })}</Label>
            <Input
              id={`${ids}-title`}
              dir="auto"
              value={title}
              minLength={3}
              maxLength={100}
              disabled={rules.title.mode === 'locked'}
              aria-describedby={rules.title.mode === 'locked' ? `${ids}-title-note` : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
            {lockedLine('title', rules.title)}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-description`}>{t('f-description', { defaultValue: 'Description' })}</Label>
            <Textarea
              id={`${ids}-description`}
              dir="auto"
              value={description}
              maxLength={1000}
              disabled={rules.description.mode === 'locked'}
              aria-describedby={rules.description.mode === 'locked' ? `${ids}-description-note` : undefined}
              onChange={(e) => setDescription(e.target.value)}
            />
            {lockedLine('description', rules.description)}
          </div>
          {(!jam.themeVoting || rules.theme.mode === 'locked') && (
            <div className="grid gap-2">
              <Label htmlFor={`${ids}-theme`}>{t('f-theme', { defaultValue: 'Secret theme' })}</Label>
              <Input
                id={`${ids}-theme`}
                dir="auto"
                value={rules.theme.mode === 'locked' ? (jam.theme ?? '') : theme}
                maxLength={120}
                placeholder={
                  rules.theme.mode === 'locked'
                    ? undefined
                    : t('f-theme-keep', { defaultValue: 'Leave blank to keep the current theme' })
                }
                disabled={rules.theme.mode === 'locked'}
                aria-describedby={rules.theme.mode === 'locked' ? `${ids}-theme-note` : undefined}
                onChange={(e) => setTheme(e.target.value)}
              />
              {lockedLine('theme', rules.theme)}
            </div>
          )}
          {dateField('startsAt', t('f-starts', { defaultValue: 'Starts' }), startsAt, setStartsAt)}
          {dateField(
            'submitEndsAt',
            t('f-submit-ends', { defaultValue: 'Submissions close' }),
            submitEndsAt,
            setSubmitEndsAt,
          )}
          {dateField(
            'ratingEndsAt',
            t('f-rating-ends', { defaultValue: 'Rating closes' }),
            ratingEndsAt,
            setRatingEndsAt,
          )}
          {jam.themeVoting && !voteLoading && (
            <div className="grid gap-2">
              <Label htmlFor={`${ids}-themeVoteOpensAt`}>{t('f-vote-opens', { defaultValue: 'Voting opens' })}</Label>
              <Input
                id={`${ids}-themeVoteOpensAt`}
                type="datetime-local"
                value={opensAtValue}
                disabled={rules.themeVoteOpensAt.mode === 'locked'}
                aria-describedby={rules.themeVoteOpensAt.mode === 'locked' ? `${ids}-themeVoteOpensAt-note` : undefined}
                onChange={(e) => setOpensAtDraft(e.target.value)}
              />
              {lockedLine('themeVoteOpensAt', rules.themeVoteOpensAt)}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="default" onClick={onClose}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={nothingEditable}>
              {t('save', { defaultValue: 'Save changes' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
