'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Trophy, Upload, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchJson } from '@/lib/http';
import type { ChallengeDetail, ChallengeView } from '@/lib/studio/challenge/shared';

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** F12 — the weekly sample flip: hear the sample, submit a flip, vote, see the winner. */
export default function ChallengePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('f-creative');
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            {t('challenge-title', { defaultValue: 'Sample flip' })}
          </DialogTitle>
        </DialogHeader>
        {openId ? (
          <Detail id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <List onOpen={setOpenId} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation('f-creative');
  const q = useQuery({
    queryKey: ['studio-challenges'],
    queryFn: () => fetchJson<{ challenges: ChallengeView[] }>('/api/studio/challenges'),
  });
  const phaseLabel = (p: ChallengeView['phase']) =>
    ({
      upcoming: t('phase-upcoming', { defaultValue: 'Starts soon' }),
      open: t('phase-open', { defaultValue: 'Submissions open' }),
      voting: t('phase-voting', { defaultValue: 'Voting' }),
      finished: t('phase-finished', { defaultValue: 'Finished' }),
    })[p];
  if (q.isLoading) return <div className="glass-fill h-24 rounded-site" aria-hidden />;
  const items = q.data?.challenges ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('challenge-none', { defaultValue: 'No sample flip is running yet. Check back soon.' })}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="glass-fill glass-interactive w-full rounded-site p-3 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-site-text">{c.title}</span>
              <span className="text-xs text-site-text-muted">{phaseLabel(c.phase)}</span>
            </div>
            <p className="mt-1 text-xs text-site-text-dim">
              {t('challenge-entries', { defaultValue: '{{n}} entries', n: c.entryCount })}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation('f-creative');
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['studio-challenge', id],
    queryFn: () => fetchJson<ChallengeDetail>(`/api/studio/challenges/${id}`),
  });
  const c = q.data;
  if (!c) return <div className="glass-fill h-24 rounded-site" aria-hidden />;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['studio-challenge', id] });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('challenge-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      let audioKey: string | undefined;
      if (file) {
        const form = new FormData();
        form.set('audio', file);
        const res = await fetch('/api/studio/challenges/audio', { method: 'POST', body: form });
        const data = (await res.json()) as { key?: string; error?: string };
        if (!res.ok || !data.key) throw new Error(data.error ?? 'Upload failed');
        audioKey = data.key;
      }
      await fetchJson(
        `/api/studio/challenges/${id}/entry`,
        post({ title, linkUrl: link.trim() || undefined, audioKey }),
      );
      toast.success(t('entry-sent', { defaultValue: 'Entry submitted' }));
    });

  const vote = (entryId: string) =>
    run(async () => {
      await fetchJson(`/api/studio/challenges/${id}/vote`, post({ entryId }));
      toast.success(t('vote-sent', { defaultValue: 'Vote cast' }));
    });

  return (
    <div className="space-y-3">
      <Button size="xs" variant="ghost" onClick={onBack}>
        <ArrowLeft />
        {t('challenge-back', { defaultValue: 'All challenges' })}
      </Button>
      <div>
        <h3 className="font-semibold text-site-text">{c.title}</h3>
        {c.brief && <p className="mt-1 text-sm text-site-text-muted">{c.brief}</p>}
        <p className="mt-2 text-xs text-site-text-dim">{c.sampleName}</p>
        <audio controls preload="none" src={c.sampleUrl} className="mt-1 w-full" />
        <p className="mt-2 text-xs text-site-text-dim">
          {t('challenge-dates', {
            defaultValue: 'Submissions close {{close}}. Voting ends {{vote}}.',
            close: new Date(c.endsAt).toLocaleString(),
            vote: new Date(c.votingEndsAt).toLocaleString(),
          })}
        </p>
      </div>

      {c.phase === 'open' && (
        <div className="glass-pane space-y-2 rounded-site p-3">
          <p className="text-sm font-medium text-site-text">
            {c.myEntryId
              ? t('entry-replace', { defaultValue: 'Replace your entry' })
              : t('entry-new', { defaultValue: 'Submit your flip' })}
          </p>
          <Input
            className="glass-inset"
            placeholder={t('entry-title', { defaultValue: 'Title' })}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            className="glass-inset"
            placeholder={t('entry-link', { defaultValue: 'Link to your project export (https)' })}
            maxLength={500}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-site-text-muted">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label={t('entry-file', {
                defaultValue: 'Audio bounce (WAV or MP3, up to 8 MB)',
              })}
            />
          </label>
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !title.trim() || (!link.trim() && !file)}
            onClick={() => void submit()}
          >
            {t('entry-submit', { defaultValue: 'Submit' })}
          </Button>
        </div>
      )}

      {c.phase === 'voting' && (
        <p className="text-sm text-site-text-muted">
          {c.myVoteEntryId
            ? t('vote-done', { defaultValue: 'You voted. Results appear when voting ends.' })
            : t('vote-hint', {
                defaultValue: 'Listen, then vote for your favourite. One vote each.',
              })}
        </p>
      )}

      <ul className="space-y-2">
        {c.entries.map((e) => (
          <li key={e.id} className="glass-fill rounded-site p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-site-text">
                {e.isWinner && (
                  <Trophy
                    className="h-4 w-4 text-site-accent"
                    aria-label={t('winner', { defaultValue: 'Winner' })}
                  />
                )}
                {e.title}
              </span>
              {c.phase === 'finished' && (
                <span className="text-xs text-site-text-muted">
                  {t('votes', { defaultValue: '{{n}} votes', n: e.voteCount })}
                </span>
              )}
            </div>
            <p className="text-xs text-site-text-dim">{e.author.name ?? e.author.handle}</p>
            {e.audioUrl && (
              <audio controls preload="none" src={e.audioUrl} className="mt-1 w-full" />
            )}
            {e.linkUrl && (
              <a
                href={e.linkUrl}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="mt-1 block truncate text-xs text-site-accent underline"
              >
                {e.linkUrl}
              </a>
            )}
            {c.phase === 'voting' && !e.mine && !c.myVoteEntryId && (
              <Button
                size="xs"
                variant="secondary"
                className="mt-2"
                disabled={busy}
                onClick={() => void vote(e.id)}
              >
                <Vote />
                {t('vote-button', { defaultValue: 'Vote' })}
              </Button>
            )}
            {c.myVoteEntryId === e.id && (
              <p className="mt-2 text-xs text-site-accent">
                {t('vote-yours', { defaultValue: 'Your vote' })}
              </p>
            )}
          </li>
        ))}
        {c.entries.length === 0 && (
          <li className="text-sm text-site-text-muted">
            {t('entries-none', { defaultValue: 'No entries yet.' })}
          </li>
        )}
      </ul>
    </div>
  );
}
