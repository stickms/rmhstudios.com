import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, Music4, PenLine } from 'lucide-react';
import { auth } from '@/lib/auth';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { playerProfile, type PlayerProfile } from '@/lib/slice-it/player.server';
import { gradeFor } from '@/lib/slice-it/scoring';
import type { Lamp } from '@/lib/slice-it/types';

/**
 * A Slice It player page — where every leaderboard row now goes (`X11`/`X12`).
 *
 * Nested under `app/routes/slice-it.tsx`, which is a top-level layout route and
 * therefore full-screen; that layout already supplies the `.slice-theme` wrapper
 * (the scoped `--slice-*` palette), the Outfit face and the toaster, so this
 * route supplies none of them a second time. The neumorphic soft-shadow pair is
 * the game's material — this page is part of the game, not a `_site` page, so it
 * follows `--slice-*` rather than the site's glass tier.
 *
 * Keyed by `@handle` rather than by user id because a handle is the thing a
 * person can read off a leaderboard, type, and share. `LeaderboardEntry.handle`
 * is null for an account without one and those rows simply do not link — the
 * alternative, building a URL out of `username`, points at the wrong player the
 * moment two people pick the same display name.
 */
const fetchPlayer = createServerFn({ method: 'GET' })
  .validator((handle: string) => handle)
  .handler(async ({ data: handle }): Promise<PlayerProfile | null> => {
    const session = await auth.api.getSession({ headers: getRequest().headers }).catch(() => null);
    return playerProfile(handle, session?.user?.id ?? null);
  });

export const Route = createFileRoute('/slice-it/player/$handle')({
  loader: async ({ params }) => {
    const profile = await fetchPlayer({ data: params.handle });
    // A handle nobody holds is a 404, not an empty profile page for a name that
    // does not exist — which would also be an indexable one.
    if (!profile) throw notFound();
    return profile;
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.user.name ?? params.handle;
    // The canonical is always the HANDLE form, even when the page was reached by
    // user id — the multiplayer surfaces link by id because the wire format has
    // no handle (see `playerProfile`), and two indexed URLs for one player is a
    // duplicate-content problem with an easy answer.
    const canonicalSegment = loaderData?.user.handle ?? params.handle;
    return {
      meta: buildMeta({
        title: `${name} — Slice It! | RMH Studios`,
        description: `${name}'s Slice It! scores: personal bests, clear lamps and recent runs.`,
        path: `/slice-it/player/${canonicalSegment}`,
      }),
      links: [{ rel: 'canonical', href: buildCanonical(`/slice-it/player/${canonicalSegment}`) }],
    };
  },
  component: PlayerPage,
});

/**
 * Lamp colours.
 *
 * Fixed hex rather than `--slice-*` tokens, for the same reason
 * `JUDGEMENT_COLORS` in `constants.ts` is: a lamp is a piece of *vocabulary* a
 * player learns, and blue has to mean full combo in every theme or it means
 * nothing.
 */
const LAMP_COLORS: Record<Lamp, string> = {
  none: 'transparent',
  failed: '#ef4444',
  cleared: '#22c55e',
  fc: '#3b82f6',
  perfect: '#eab308',
};

function PlayerPage() {
  const { t } = useTranslation('r-slice-it');
  const profile = Route.useLoaderData();

  return (
    <main className="min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Link
          to="/slice-it"
          className="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-widest text-slice-text-light hover:text-slice-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('player-back', { defaultValue: 'Back to Slice It' })}
        </Link>

        <PlayerHeader profile={profile} />
        <LampSummary profile={profile} />

        <div className="grid gap-6 lg:grid-cols-2">
          <BestScores profile={profile} />
          <RecentRuns profile={profile} />
        </div>
      </div>
    </main>
  );
}

/** The neumorphic panel every section on this page sits in. */
function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-[1.5rem] bg-slice-bg p-5 shadow-[10px_10px_24px_var(--slice-shadow-dark),-10px_-10px_24px_var(--slice-shadow-light)]">
      <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-slice-text-light">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PlayerHeader({ profile }: { profile: PlayerProfile }) {
  const { t } = useTranslation('r-slice-it');
  const { user, career } = profile;

  return (
    <header className="flex flex-wrap items-center gap-5 rounded-[2rem] bg-slice-bg p-6 shadow-[16px_16px_40px_var(--slice-shadow-dark),-16px_-16px_40px_var(--slice-shadow-light)]">
      {user.image ? (
        <img
          src={user.image}
          alt=""
          width={72}
          height={72}
          className="h-18 w-18 shrink-0 rounded-full object-cover shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-slice-bg text-2xl font-black text-slice-text-light shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slice-text-darker">
          <span className="truncate">{user.name}</span>
          {user.isVerified && <BadgeCheck className="h-5 w-5 shrink-0 text-blue-500" aria-hidden />}
        </h1>
        {user.handle && <p className="text-sm font-bold text-slice-text-light">@{user.handle}</p>}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slice-text-muted">
          <span className="inline-flex items-center gap-1">
            <Music4 className="h-3.5 w-3.5" aria-hidden />
            {t('player-uploads', { defaultValue: '{{count}} songs uploaded', count: profile.uploads })}
          </span>
          <span className="inline-flex items-center gap-1">
            <PenLine className="h-3.5 w-3.5" aria-hidden />
            {t('player-charts', { defaultValue: '{{count}} charts authored', count: profile.charts })}
          </span>
        </p>
      </div>

      <dl className="flex gap-6">
        <div className="text-right">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slice-text-light">
            {t('player-total-score', { defaultValue: 'Total score' })}
          </dt>
          <dd className="text-xl font-black tabular-nums text-blue-600">
            {(career?.totalScore ?? 0).toLocaleString()}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slice-text-light">
            {t('player-games-played', { defaultValue: 'Runs' })}
          </dt>
          <dd className="text-xl font-black tabular-nums text-slice-text">
            {(career?.gamesPlayed ?? 0).toLocaleString()}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function LampSummary({ profile }: { profile: PlayerProfile }) {
  const { t } = useTranslation('r-slice-it');
  const played = profile.lamps.some((tier) => tier.played > 0);

  return (
    <Panel title={t('player-lamps', { defaultValue: 'Clear lamps' })}>
      {played ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {profile.lamps.map((tier) => (
            <li
              key={tier.difficulty}
              className="rounded-xl bg-slice-bg p-3 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slice-text-light">
                {tier.difficulty}
              </p>
              <p className="text-lg font-black tabular-nums text-slice-text">{tier.played}</p>
              <ul className="mt-1 space-y-0.5 text-[10px] font-bold text-slice-text-muted">
                <li>
                  <LampDot lamp="cleared" />
                  {t('player-lamp-cleared', { defaultValue: '{{count}} cleared', count: tier.cleared })}
                </li>
                <li>
                  <LampDot lamp="fc" />
                  {t('player-lamp-fc', { defaultValue: '{{count}} full combo', count: tier.fullCombo })}
                </li>
                <li>
                  <LampDot lamp="perfect" />
                  {t('player-lamp-perfect', { defaultValue: '{{count}} perfect', count: tier.perfect })}
                </li>
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm font-bold text-slice-text-light">
          {t('player-no-scores', { defaultValue: 'No scores on the board yet.' })}
        </p>
      )}
    </Panel>
  );
}

function LampDot({ lamp }: { lamp: Lamp }) {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: LAMP_COLORS[lamp] }}
    />
  );
}

function BestScores({ profile }: { profile: PlayerProfile }) {
  const { t } = useTranslation('r-slice-it');

  return (
    <Panel title={t('player-best', { defaultValue: 'Personal bests' })}>
      {profile.best.length === 0 ? (
        <p className="py-4 text-center text-sm font-bold text-slice-text-light">
          {t('player-no-scores', { defaultValue: 'No scores on the board yet.' })}
        </p>
      ) : (
        <ol className="space-y-2">
          {profile.best.map((best) => (
            <li
              key={`${best.songId}-${best.difficulty}-${best.modPool}`}
              className="flex items-center gap-3 rounded-xl bg-slice-bg p-3 shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]"
            >
              <LampDot lamp={best.lamp} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slice-text">
                  {best.title}
                </span>
                <span className="block truncate text-[11px] font-bold text-slice-text-light">
                  {best.artist} · {best.difficulty}
                  {best.modPool !== 'none' ? ` · ${best.modPool}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-black tabular-nums text-blue-600">
                  {best.score.toLocaleString()}
                </span>
                {best.accuracy !== null && (
                  <span className="block font-mono text-[10px] font-bold text-slice-text-light">
                    {gradeFor(best.accuracy)} · {(best.accuracy * 100).toFixed(1)}%
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function RecentRuns({ profile }: { profile: PlayerProfile }) {
  const { t } = useTranslation('r-slice-it');

  return (
    <Panel title={t('player-recent', { defaultValue: 'Recent runs' })}>
      {profile.recent.length === 0 ? (
        // Every run before `SliceRun` existed was destroyed by the personal-best
        // upsert, so an established player can legitimately have bests and no
        // history. Say that rather than implying they have not played.
        <p className="py-4 text-center text-sm font-bold text-slice-text-light">
          {t('player-no-runs', { defaultValue: 'No runs recorded yet.' })}
        </p>
      ) : (
        <ol className="space-y-2">
          {profile.recent.map((run, index) => (
            <li
              key={`${run.songId}-${run.playedAt}-${index}`}
              className="flex items-center gap-3 rounded-xl bg-slice-bg p-3 shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]"
            >
              <LampDot lamp={run.lamp} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slice-text">{run.title}</span>
                <span className="block truncate text-[11px] font-bold text-slice-text-light">
                  {run.artist} · {run.difficulty}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-black tabular-nums text-slice-text">
                  {run.score.toLocaleString()}
                </span>
                <span className="block font-mono text-[10px] font-bold text-slice-text-light">
                  {(run.accuracy * 100).toFixed(1)}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
