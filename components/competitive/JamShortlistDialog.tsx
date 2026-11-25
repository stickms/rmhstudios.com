/**
 * "Edit shortlist" (s14-14): an admin replaces a voting jam's theme shortlist (3 to 12) from the jam's page, through
 * the existing `PUT /api/jams/$slug/theme-candidates`. Offered before the start only; the server refuses once a
 * member has marked a theme ("The shortlist locks when the first member votes"), and its refusal is shown as is.
 * Mounted fresh each time it opens.
 */
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
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
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { setJamThemeCandidatesApi } from '@/lib/competitive/jam-themes.contract';
import { jamThemeVoteQuery } from '@/lib/competitive/jam-themes.queries';
import {
  MAX_THEME_CANDIDATES,
  MIN_THEME_CANDIDATES,
  THEME_TEXT_MAX,
  validateCandidates,
  type CandidateProblem,
} from '@/lib/competitive/jam-themes';

function ShortlistForm({ slug, initial, onClose }: { slug: string; initial: string[]; onClose: () => void }) {
  const { t } = useTranslation('jam-editing');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const ids = useId();
  const [candidates, setCandidates] = useState<string[]>(
    initial.length >= MIN_THEME_CANDIDATES
      ? initial
      : [...initial, ...Array.from({ length: MIN_THEME_CANDIDATES - initial.length }, () => '')],
  );
  const [problem, setProblem] = useState<CandidateProblem | null>(null);
  const [busy, setBusy] = useState(false);

  const problems: Record<CandidateProblem, string> = {
    count: t('problem-count', {
      defaultValue: 'Offer {{min}} to {{max}} themes',
      min: MIN_THEME_CANDIDATES,
      max: MAX_THEME_CANDIDATES,
    }),
    empty: t('problem-empty', { defaultValue: 'A theme cannot be empty' }),
    length: t('problem-length', { defaultValue: 'A theme can be at most {{max}} characters', max: THEME_TEXT_MAX }),
    duplicate: t('problem-duplicate', { defaultValue: 'Each theme must be different' }),
  };

  const set = (next: string[]) => {
    setCandidates(next);
    setProblem(null);
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...candidates];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
  };

  const save = async () => {
    const valid = validateCandidates(candidates);
    if (!valid.ok) {
      setProblem(valid.problem);
      return;
    }
    setBusy(true);
    try {
      await api(setJamThemeCandidatesApi, { params: { slug }, body: { candidates: valid.texts } });
      toast.success(t('shortlist-saved', { defaultValue: 'Shortlist updated' }));
      await queryClient.invalidateQueries({ queryKey: ['jams'] });
      onClose();
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('shortlist-failed', { defaultValue: 'Could not update the shortlist' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ul>
        {candidates.map((text, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-site-border py-2">
            <Input
              dir="auto"
              value={text}
              maxLength={THEME_TEXT_MAX}
              aria-label={t('candidate', { defaultValue: 'Theme {{n}}', n: i + 1 })}
              aria-describedby={problem ? `${ids}-problem` : undefined}
              aria-invalid={problem ? true : undefined}
              onChange={(e) => set(candidates.map((c, k) => (k === i ? e.target.value : c)))}
            />
            <IconButton
              icon={ArrowUp}
              label={t('move-up', { defaultValue: 'Move up' })}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <IconButton
              icon={ArrowDown}
              label={t('move-down', { defaultValue: 'Move down' })}
              disabled={i === candidates.length - 1}
              onClick={() => move(i, 1)}
            />
            <IconButton
              icon={X}
              label={t('remove', { defaultValue: 'Remove theme' })}
              disabled={candidates.length <= MIN_THEME_CANDIDATES}
              onClick={() => set(candidates.filter((_, k) => k !== i))}
            />
          </li>
        ))}
      </ul>
      {problem && (
        <p id={`${ids}-problem`} role="alert" className="t-meta text-site-danger">
          {problems[problem]}
        </p>
      )}
      <div>
        <Button
          type="button"
          disabled={candidates.length >= MAX_THEME_CANDIDATES}
          onClick={() => set([...candidates, ''])}
        >
          <Plus />
          {t('add', { defaultValue: 'Add a theme' })}
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="default" onClick={onClose}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="button" variant="primary" loading={busy} onClick={() => void save()}>
          {t('shortlist-save', { defaultValue: 'Save shortlist' })}
        </Button>
      </DialogFooter>
    </>
  );
}

export function JamShortlistDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { t } = useTranslation('jam-editing');
  const query = useQuery({ ...jamThemeVoteQuery(slug), retry: false });
  const view = query.data?.view;
  const arrival = useArrival(view !== undefined);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shortlist-title', { defaultValue: 'Edit shortlist' })}</DialogTitle>
          <DialogDescription>
            {t('shortlist-desc', {
              defaultValue: 'The shortlist locks when the first member votes. The first theme wins a tie.',
            })}
          </DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <p role="alert" className="t-meta text-site-danger">
            {t('shortlist-load-failed', { defaultValue: 'Could not load the shortlist' })}
          </p>
        ) : !view ? (
          <Skeleton className="h-32 rounded-site" />
        ) : (
          <div className={cn('grid gap-5 sm:gap-6', arrival)}>
            <ShortlistForm slug={slug} initial={view.candidates.map((c) => c.text)} onClose={onClose} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
