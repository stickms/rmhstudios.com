/**
 * /speedruns — replay-verified speedrun boards (design K1).
 *
 * Three selections drive the page: game → category → game version. The version
 * selector defaults to `all`, which shows every version's board LABELLED rather
 * than merged, because a run set before a game update was set in a different
 * game (see `lib/speedrun/versions.ts`).
 *
 * Strings live in the `c-tournaments` catalog under a `speedrun-` prefix rather
 * than in a new `c-speedrun` namespace. A namespace that is not listed in
 * `NAMESPACES` (`lib/i18n/config.ts`) is never loaded — the UI silently serves
 * every `defaultValue` in every language and nothing reports it — and this
 * change does not own that file. `c-tournaments` is the competitive-play
 * catalog, so the keys are at home there; the prefix keeps them from colliding
 * with the tournament keys already in it (`title`, `description`, `game`, …),
 * which would otherwise render tournament copy on this page, because a
 * `defaultValue` is only consulted when the key is MISSING.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Timer } from 'lucide-react';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { SpeedrunBoard, SpeedrunQueue } from '@/components/speedrun/SpeedrunBoard';
import { SubmitRunPanel } from '@/components/speedrun/SubmitRunPanel';
import { TierNote } from '@/components/speedrun/VerificationBadge';
import { versionsOf } from '@/lib/speedrun/versions';
// Titles for the games that can record a replay. A board can only exist for one
// of those, so this map covers every option the picker can show; the id is the
// fallback rather than a second hardcoded list that would drift from the first.
import { REPLAY_GAME_TITLES } from '@/lib/game/replay';
import {
  ALL_VERSIONS,
  type SpeedrunCategoryView,
  type SpeedrunEntryView,
  type SpeedrunMetric,
} from '@/lib/speedrun/types';

export const Route = createFileRoute('/_site/speedruns')({
  head: () => ({
    meta: buildMeta({
      title: 'Speedruns | RMH Studios',
      description:
        'Replay-verified speedrun categories: every run is re-simulated from its own inputs, and boards are kept per game version.',
      path: '/speedruns',
    }),
    links: [buildCanonical('/speedruns')],
  }),
  component: SpeedrunsPage,
});

interface BoardResponse {
  categories: SpeedrunCategoryView[];
  metric: SpeedrunMetric;
  entries: SpeedrunEntryView[];
}

function SpeedrunsPage() {
  const { t } = useTranslation('c-tournaments');
  const { data: session } = useSession();
  const viewer = session?.user ?? null;
  const isAdmin = Boolean((viewer as { isAdmin?: boolean } | null)?.isAdmin);

  const [categories, setCategories] = useState<SpeedrunCategoryView[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [game, setGame] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [version, setVersion] = useState<string>(ALL_VERSIONS);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch('/api/speedrun/categories');
      const data = (await res.json().catch(() => ({ categories: [] }))) as {
        categories?: SpeedrunCategoryView[];
      };
      setCategories(res.ok ? (data.categories ?? []) : []);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const games = useMemo(() => [...new Set(categories.map((c) => c.game))].sort(), [categories]);

  // One tab per category slug of the selected game. Several versions of the same
  // slug are ONE tab — the version picker below chooses between their boards.
  const slugs = useMemo(() => {
    const forGame = categories.filter((c) => c.game === game);
    const seen = new Map<string, SpeedrunCategoryView>();
    for (const category of forGame) if (!seen.has(category.slug)) seen.set(category.slug, category);
    return [...seen.values()];
  }, [categories, game]);

  useEffect(() => {
    if (!game && games.length > 0) setGame(games[0]);
  }, [game, games]);

  useEffect(() => {
    if (slugs.length === 0) {
      setSlug(null);
      return;
    }
    if (!slug || !slugs.some((c) => c.slug === slug)) setSlug(slugs[0].slug);
  }, [slugs, slug]);

  const loadBoard = useCallback(async () => {
    if (!game || !slug) return;
    setLoadingBoard(true);
    try {
      const params = new URLSearchParams({ game, slug, version });
      const res = await fetch(`/api/speedrun/leaderboard?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as BoardResponse | null;
      setBoard(res.ok ? data : null);
    } finally {
      setLoadingBoard(false);
    }
  }, [game, slug, version]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const selected = board?.categories[0] ?? slugs.find((c) => c.slug === slug) ?? null;
  const openVersions = useMemo(
    () => versionsOf(categories.filter((c) => c.game === game && c.slug === slug)),
    [categories, game, slug],
  );

  async function seedDefaults() {
    setSeeding(true);
    try {
      const res = await fetch('/api/speedrun/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      if (!res.ok) {
        toast.error(
          t('speedrun-seed-failed', { defaultValue: 'Could not open the starter boards' }),
        );
        return;
      }
      toast.success(t('speedrun-seed-done', { defaultValue: 'Starter boards opened' }));
      await loadCategories();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <PageLayout
      title={t('speedrun-title', { defaultValue: 'Speedruns' })}
      description={t('speedrun-description', {
        defaultValue:
          'Every run points at a replay, and the replay is re-simulated from its own inputs — so a record is proved, not vouched for.',
      })}
      wide
    >
      {loadingCategories ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Timer}
          title={t('speedrun-no-boards-title', { defaultValue: 'No boards are open yet' })}
          description={t('speedrun-no-boards-body', {
            defaultValue:
              'A speedrun board is a category on one game version. An admin opens the first ones.',
          })}
          action={
            isAdmin ? (
              <Button onClick={seedDefaults} loading={seeding}>
                {t('speedrun-seed-action', { defaultValue: 'Open the starter boards' })}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={game ?? ''}
              onChange={(event) => setGame(event.target.value)}
              aria-label={t('speedrun-game-label', { defaultValue: 'Game' })}
              containerClassName="min-w-40"
            >
              {games.map((id) => (
                <option key={id} value={id}>
                  {REPLAY_GAME_TITLES[id] ?? id}
                </option>
              ))}
            </Select>

            <Select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              aria-label={t('speedrun-version-label', { defaultValue: 'Game version' })}
              containerClassName="min-w-40"
            >
              <option value={ALL_VERSIONS}>
                {t('speedrun-all-versions', { defaultValue: 'All versions (labelled)' })}
              </option>
              {openVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>

          {slugs.length > 1 && (
            <LiquidTabs
              aria-label={t('speedrun-category-label', { defaultValue: 'Category' })}
              value={slug ?? ''}
              onChange={setSlug}
              tabs={slugs.map((c) => ({ id: c.slug, label: c.name }))}
            />
          )}

          {selected && (
            <Card pane className="px-5 sm:px-6">
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-lg font-medium text-site-text">{selected.name}</h2>
                <p className="text-sm text-site-text-muted">{selected.rules}</p>
                <TierNote tier={selected.tier} />
              </div>
            </Card>
          )}

          {loadingBoard || !board ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <SpeedrunBoard
                entries={board.entries}
                metric={board.metric}
                tier={selected?.tier ?? 'manual'}
                version={version}
                viewerId={viewer?.id ?? null}
              />
              <SpeedrunQueue entries={board.entries} tier={selected?.tier ?? 'manual'} />
            </>
          )}

          {viewer && game && slug && (
            <SubmitRunPanel
              game={game}
              slug={slug}
              openVersions={openVersions}
              onSubmitted={loadBoard}
            />
          )}
        </div>
      )}
    </PageLayout>
  );
}
