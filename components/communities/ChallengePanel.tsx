'use client';

/** N5 — the weekly challenge tab: prompt, entries, voting, winner. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CommunityComposer } from '@/components/communities/CommunityComposer';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import type { ChallengeDTO } from '@/lib/communities/plus-schema';
import type { CommunityExtrasDTO } from '@/lib/communities/plus-schema';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `<input type="datetime-local">` value for `hours` from now. */
const localInput = (hours: number) => {
  const d = new Date(Date.now() + hours * 3_600_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function CreateChallenge({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const { t } = useTranslation('f-communities-plus');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitEnds, setSubmitEnds] = useState(localInput(24 * 5));
  const [voteEnds, setVoteEnds] = useState(localInput(24 * 7));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/challenge'), 'POST', {
      title,
      prompt,
      submitEndsAt: new Date(submitEnds).toISOString(),
      voteEndsAt: new Date(voteEnds).toISOString(),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(
        res.error || t('challenge-create-error', { defaultValue: "Couldn't start the challenge" }),
      );
      return;
    }
    onCreated();
  };

  return (
    <form
      className="glass-pane m-3 flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3 className="text-sm font-semibold text-site-text">
        {t('challenge-create-title', { defaultValue: 'Start a challenge' })}
      </h3>
      <Input
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('challenge-title-ph', { defaultValue: 'Challenge title' })}
        aria-label={t('challenge-title-ph', { defaultValue: 'Challenge title' })}
        required
      />
      <Textarea
        value={prompt}
        maxLength={1000}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t('challenge-prompt-ph', { defaultValue: 'The prompt members respond to' })}
        aria-label={t('challenge-prompt-ph', { defaultValue: 'The prompt members respond to' })}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-site-text-muted">
          {t('challenge-submit-ends', { defaultValue: 'Submissions close' })}
          <Input
            type="datetime-local"
            value={submitEnds}
            onChange={(e) => setSubmitEnds(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-site-text-muted">
          {t('challenge-vote-ends', { defaultValue: 'Voting closes' })}
          <Input
            type="datetime-local"
            value={voteEnds}
            onChange={(e) => setVoteEnds(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="accent"
          size="sm"
          loading={saving}
          disabled={!title.trim() || !prompt.trim()}
        >
          {t('challenge-create', { defaultValue: 'Start challenge' })}
        </Button>
      </div>
    </form>
  );
}

export default function ChallengePanel({
  slug,
  communityId,
  joined,
  isMod,
  extras,
}: {
  slug: string;
  communityId: string;
  joined: boolean;
  isMod: boolean;
  extras: CommunityExtrasDTO | null;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [challenge, setChallenge] = useState<ChallengeDTO | null | undefined>(undefined);
  const [entering, setEntering] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await plusFetch<{ challenge: ChallengeDTO | null }>(
      communityApi(slug, '/challenge'),
    );
    setChallenge(res.data?.challenge ?? null);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (challenge === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (challenge === null) {
    return isMod ? (
      <CreateChallenge slug={slug} onCreated={load} />
    ) : (
      <EmptyState
        icon={Trophy}
        title={t('challenge-none', { defaultValue: 'No challenge right now' })}
        description={t('challenge-none-desc', {
          defaultValue: 'When the mods post a prompt, you can enter and vote here.',
        })}
      />
    );
  }

  const vote = async (entryId: string) => {
    setVoting(entryId);
    const res = await plusFetch(communityApi(slug, '/challenge/vote'), 'POST', { entryId });
    setVoting(null);
    if (!res.ok) {
      toast.error(
        res.error || t('challenge-vote-error', { defaultValue: "Couldn't record your vote" }),
      );
      return;
    }
    toast.success(t('challenge-voted', { defaultValue: 'Vote recorded' }));
    void load();
  };

  const cancel = async () => {
    const res = await plusFetch(communityApi(slug, `/challenge/${challenge.id}`), 'DELETE');
    if (!res.ok) {
      toast.error(
        res.error || t('challenge-cancel-error', { defaultValue: "Couldn't cancel the challenge" }),
      );
      return;
    }
    void load();
  };

  const phaseLabel =
    challenge.phase === 'submit'
      ? t('challenge-phase-submit', { defaultValue: 'Open for entries' })
      : challenge.phase === 'vote'
        ? t('challenge-phase-vote', { defaultValue: 'Voting' })
        : t('challenge-phase-closed', { defaultValue: 'Finished' });

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <section className="glass-pane p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-site-text">{challenge.title}</h3>
          <span className="rounded-full border border-site-accent/30 bg-site-accent-dim px-2.5 py-0.5 text-xs font-semibold text-site-accent">
            {phaseLabel}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-site-text">
          {challenge.prompt}
        </p>
        <p className="mt-3 text-xs text-site-text-muted">
          {t('challenge-windows', {
            submit: fmt(challenge.submitEndsAt),
            vote: fmt(challenge.voteEndsAt),
            defaultValue: 'Entries until {{submit}} · voting until {{vote}}',
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {challenge.phase === 'submit' && joined && !challenge.myEntryId && (
            <Button size="sm" variant="accent" onClick={() => setEntering((v) => !v)}>
              {entering
                ? t('challenge-enter-cancel', { defaultValue: 'Hide the composer' })
                : t('challenge-enter', { defaultValue: 'Enter the challenge' })}
            </Button>
          )}
          {challenge.myEntryId && challenge.phase === 'submit' && (
            <span className="text-sm text-site-text-muted">
              {t('challenge-entered', { defaultValue: "You're entered — good luck!" })}
            </span>
          )}
          {isMod && challenge.phase !== 'closed' && (
            <Button size="sm" variant="outline" onClick={cancel}>
              {t('challenge-cancel', { defaultValue: 'Cancel challenge' })}
            </Button>
          )}
        </div>
      </section>

      {entering && challenge.phase === 'submit' && (
        <section className="glass-pane overflow-hidden">
          <p className="px-4 pt-3 text-xs text-site-text-muted">
            {t('challenge-enter-hint', {
              defaultValue: 'Your post is your entry. Attach any image or media and post it here.',
            })}
          </p>
          <CommunityComposer
            communityId={communityId}
            extras={extras}
            challengeId={challenge.id}
            onPosted={() => {
              setEntering(false);
              toast.success(t('challenge-entry-posted', { defaultValue: 'Entry submitted' }));
              void load();
            }}
          />
        </section>
      )}

      {challenge.entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={t('challenge-no-entries', { defaultValue: 'No entries yet' })}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {challenge.entries.map((e) => {
            const name =
              e.author?.name || e.author?.handle || t('someone', { defaultValue: 'Someone' });
            const voted = challenge.myVoteEntryId === e.id;
            return (
              <li key={e.id} className="glass-fill flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <UserAvatar src={e.author?.image} alt={name} size={28} fallbackName={name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-site-text">
                    {name}
                  </span>
                  {e.isWinner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-site-warning/15 px-2 py-0.5 text-xs font-semibold text-site-warning">
                      <Trophy className="h-3 w-3" aria-hidden />
                      {t('challenge-winner', { defaultValue: 'Winner' })}
                    </span>
                  )}
                </div>
                {(e.imageUrl || e.gifUrl) && (
                  <img
                    src={e.imageUrl ?? e.gifUrl ?? ''}
                    alt={e.imageAlt ?? ''}
                    loading="lazy"
                    className="max-h-64 w-full rounded-site-sm object-cover"
                  />
                )}
                {e.content && (
                  <p className="line-clamp-4 break-words text-sm text-site-text">{e.content}</p>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <Link
                    to={`/u/${e.author?.handle || e.author?.id}/post/${e.postId}` as string}
                    className="text-xs text-site-accent hover:underline"
                  >
                    {t('challenge-view-post', { defaultValue: 'View post' })}
                  </Link>
                  {challenge.phase === 'vote' && joined && !e.mine && (
                    <Button
                      size="sm"
                      variant={voted ? 'accent' : 'outline'}
                      disabled={!!challenge.myVoteEntryId || voting !== null}
                      loading={voting === e.id}
                      onClick={() => vote(e.id)}
                    >
                      {voted
                        ? t('challenge-your-vote', { defaultValue: 'Your vote' })
                        : t('challenge-vote', { defaultValue: 'Vote' })}
                    </Button>
                  )}
                  {challenge.phase === 'closed' && e.voteCount !== null && (
                    <span className="text-xs tabular-nums text-site-text-muted">
                      {t('challenge-votes', { n: e.voteCount, defaultValue: '{{n}} votes' })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
