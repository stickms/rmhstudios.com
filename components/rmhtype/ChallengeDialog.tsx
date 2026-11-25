/**
 * "Challenge someone" (s11-12): send your best run on a curated passage to a mutual. Opened from the finish screen of a
 * solo run (the passage is known) and from the progress page (the member picks one of their bests). The mutuals and
 * the bests are read through React Query when the dialog opens; the server decides who may be challenged and says
 * only "can't be challenged", never why. Names are member text, so the select carries `dir="auto"` and the sentence
 * that names one isolates it.
 */
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import {
  RMHTYPE_CHALLENGES_KEY,
  rmhTypeChallengeMutualsQuery,
  rmhTypeChallengeRunsQuery,
  sendRmhTypeChallenge,
} from '@/lib/rmhtype/rmhtype.queries';

export interface ChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The passage to send, when the dialog opens from a run on it. Without it the member picks one of their bests. */
  passageId?: string;
}

export function ChallengeDialog({ open, onOpenChange, passageId }: ChallengeDialogProps) {
  const { t } = useTranslation('type-challenges');
  const refusalText = useRefusalText();
  const qc = useQueryClient();
  const ids = useId();
  const [opponentChoice, setOpponentChoice] = useState<string | null>(null);
  const [passageChoice, setPassageChoice] = useState<string | null>(null);

  const mutuals = useQuery({ ...rmhTypeChallengeMutualsQuery(open), retry: false });
  const runs = useQuery({ ...rmhTypeChallengeRunsQuery(open), retry: false });
  const people = mutuals.data?.mutuals ?? [];
  const bests = runs.data?.runs ?? [];
  const loading = mutuals.isPending || runs.isPending;
  const failed = mutuals.isError || runs.isError;
  const arrival = useArrival(!loading);

  const chosenPassage = passageId ?? passageChoice ?? bests[0]?.passageId ?? '';
  const run = bests.find((r) => r.passageId === chosenPassage);
  const opponentId = opponentChoice ?? people[0]?.id ?? '';
  const opponent = people.find((p) => p.id === opponentId);
  const ready = !!run && !!opponent;

  const send = useMutation({
    mutationFn: () => sendRmhTypeChallenge({ opponentId, passageId: chosenPassage }),
    onSuccess: () => {
      toast.success(t('sent', { defaultValue: 'Challenge sent' }));
      void qc.invalidateQueries({ queryKey: RMHTYPE_CHALLENGES_KEY });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(refusalText.maybe(err) ?? t('send-failed', { defaultValue: 'Could not send the challenge' })),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialog-title', { defaultValue: 'Challenge someone' })}</DialogTitle>
          <DialogDescription>
            {t('dialog-hint', {
              defaultValue:
                'Send your best run on a passage to a friend who follows you back. They race it once; you both hear who won.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className={arrival ? `space-y-4 ${arrival}` : 'space-y-4'}>
          {failed ? (
            <p role="alert" className="text-sm text-app-danger">
              {t('dialog-load-failed', { defaultValue: 'Could not load your friends and your bests.' })}
            </p>
          ) : loading ? (
            <p role="status" className="text-sm text-app-text-muted">
              {t('dialog-loading', { defaultValue: 'Loading…' })}
            </p>
          ) : (
            <>
              {passageId === undefined && (
                <div className="space-y-1">
                  <label htmlFor={`${ids}-run`} className="text-sm font-medium">
                    {t('run-label', { defaultValue: 'Your best run' })}
                  </label>
                  <select
                    id={`${ids}-run`}
                    value={chosenPassage}
                    onChange={(e) => setPassageChoice(e.target.value)}
                    disabled={bests.length === 0}
                    className="h-9 w-full rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text pointer-coarse:h-11"
                  >
                    {bests.map((r) => (
                      <option key={r.passageId} value={r.passageId}>
                        {t('run-option', {
                          defaultValue: '{{title}}: {{wpm}} WPM',
                          title: r.title,
                          wpm: Math.round(r.wpm),
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {run ? (
                passageId !== undefined && (
                  <p className="text-sm text-app-text-muted">
                    {t('run-summary', {
                      defaultValue: 'Your best on this passage: {{wpm}} WPM',
                      wpm: Math.round(run.wpm),
                    })}
                  </p>
                )
              ) : (
                <p role="status" className="text-sm text-app-text-muted">
                  {t('no-run', {
                    defaultValue:
                      'Set a best run of at least 90% accuracy on a standard passage first. Saved texts and written-to-order passages cannot be sent.',
                  })}
                </p>
              )}

              {people.length === 0 ? (
                <p role="status" className="text-sm text-app-text-muted">
                  {t('no-mutuals', {
                    defaultValue:
                      'You can challenge a member who follows you back. Follow someone, and ask them to follow you.',
                  })}
                </p>
              ) : (
                <div className="space-y-1">
                  <label htmlFor={`${ids}-who`} className="text-sm font-medium">
                    {t('who-label', { defaultValue: 'Challenge' })}
                  </label>
                  <select
                    id={`${ids}-who`}
                    dir="auto"
                    value={opponentId}
                    onChange={(e) => setOpponentChoice(e.target.value)}
                    className="h-9 w-full rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text pointer-coarse:h-11"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.handle ? `${p.name} (@${p.handle})` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-app-text-muted">
                {t('one-attempt', {
                  defaultValue: 'They get one attempt. Leaving the race or reloading counts as did not finish.',
                })}{' '}
                <Link to="/rmhtype/challenges" className="underline">
                  {t('see-challenges', { defaultValue: 'Your challenges' })}
                </Link>
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('cancel', { defaultValue: 'Cancel' })}</Button>
          <Button variant="primary" disabled={!ready} loading={send.isPending} onClick={() => send.mutate()}>
            {t('send', { defaultValue: 'Send challenge' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The progress page's section: a button for the dialog and a link to the page. */
export function ChallengeSection() {
  const { t } = useTranslation('type-challenges');
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="challenges-heading">
      <h2 id="challenges-heading" className="t-heading mb-1">
        {t('section-title', { defaultValue: 'Challenges' })}
      </h2>
      <p className="mb-3 max-w-xl text-sm text-app-text-muted">
        {t('section-body', {
          defaultValue: 'Send your best run on a passage to a friend and see who types faster.',
        })}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setOpen(true)}>{t('challenge-someone', { defaultValue: 'Challenge someone' })}</Button>
        <Link to="/rmhtype/challenges" className="text-sm underline">
          {t('see-challenges', { defaultValue: 'Your challenges' })}
        </Link>
      </div>
      <ChallengeDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
