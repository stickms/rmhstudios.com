'use client';

/**
 * The campaign, as a page of the exercise book.
 *
 * Data-driven from `data/bums-rush/levels/index.json` rather than from a
 * hardcoded eight worlds, because the manifest is the source of truth for what
 * exists and content lands world by world (§20 phase 5). A build with one
 * authored world shows one world and says nothing false about the other seven.
 *
 * Layout is `auto-fit`/`minmax` twice over — worlds stack, levels tile — so the
 * same markup is a single column of nine tiles on a 320px phone and four rows
 * of nine on an ultrawide, with no breakpoint list to keep in step.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, User } from 'lucide-react';
import { loadManifest, worldCompletion } from '@/lib/bums-rush/levels';
import type { LevelManifest, LevelManifestEntry, Profile } from '@/lib/bums-rush/types';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import { formatFraction, formatPercent } from '../format';
import { useNumberFormat } from '../hooks';
import { ScreenFrame } from './ScreenFrame';

interface WorldMapProps {
  profile: Profile;
  onSelectLevel: (levelId: string) => void;
  onBack: () => void;
}

/** Every level id the player has cleared at ANY player count. */
export function clearedLevelIds(profile: Profile): Set<string> {
  const out = new Set<string>();
  for (const clear of Object.values(profile.clears)) out.add(clear.levelId);
  return out;
}

export function WorldMap({ profile, onSelectLevel, onBack }: WorldMapProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const [manifest, setManifest] = useState<LevelManifest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cleared = useMemo(() => clearedLevelIds(profile), [profile]);

  return (
    <ScreenFrame
      title={t('map.heading', { defaultValue: 'The campaign' })}
      subtitle={t('map.sub', {
        defaultValue: 'Levels marked with a head can be finished alone. The rest want company.',
      })}
      width="wide"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      {failed ? (
        <PaperCard className="p-[clamp(1rem,3vmin,2rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('map.failed-title', { defaultValue: 'The level list did not load' })}
          </h2>
          <p className="mt-2 text-sm text-bum-graphite">
            {t('map.failed-body', {
              defaultValue:
                'Something went wrong fetching the campaign. Your progress is safe — try again, or go back and play something else.',
            })}
          </p>
          <InkButton className="mt-4" onClick={onBack}>
            {t('nav.back', { defaultValue: 'Back' })}
          </InkButton>
        </PaperCard>
      ) : null}

      {!manifest && !failed ? (
        <p className="text-sm text-bum-graphite" role="status">
          {t('map.loading', { defaultValue: 'Turning the page…' })}
        </p>
      ) : null}

      {manifest ? (
        <div className="space-y-[clamp(1rem,3vmin,2rem)]">
          {manifest.worlds.map((world) => {
            const completion = worldCompletion(manifest, world.world, cleared);
            return (
              <section key={world.world} aria-labelledby={`bums-world-${world.world}`}>
                <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`bums-world-${world.world}`} className="text-xl font-semibold text-bum-ink">
                      {t(world.name, {
                        defaultValue: t('map.world-fallback', {
                          defaultValue: 'World {{n}}',
                          n: world.world,
                        }),
                      })}
                    </h2>
                    <p className="text-sm text-bum-graphite">
                      {formatFraction(completion.cleared, completion.total, nf)}
                      <span aria-hidden="true"> · </span>
                      {formatPercent(completion.percent, nf)}
                    </p>
                  </div>

                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-2">
                    {world.levels.map((entry) => (
                      <li key={entry.id}>
                        <LevelTile
                          entry={entry}
                          cleared={cleared.has(entry.id)}
                          onSelect={() => onSelectLevel(entry.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </PaperCard>
              </section>
            );
          })}

          <StickyNote className="rotate-[-0.8deg]">
            {t('map.more-coming', {
              defaultValue: 'More worlds are being drawn. What is here is finished and playable.',
            })}
          </StickyNote>
        </div>
      ) : null}
    </ScreenFrame>
  );
}

function LevelTile({
  entry,
  cleared,
  onSelect,
}: {
  entry: LevelManifestEntry;
  cleared: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const solo = entry.minPlayers === 1;

  const name = t(entry.name, { defaultValue: '' });
  const label =
    name ||
    t('map.level-fallback', { defaultValue: 'Level {{n}}', n: entry.index });

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-full w-full flex-col gap-1 rounded-bum border-2 border-bum-ink bg-bum-surface p-2 text-left shadow-[2px_2px_0_0_var(--bum-graphite)] transition-colors hover:bg-bum-paper-2"
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold tabular-nums text-bum-graphite">
          {nf.format(entry.index)}
        </span>
        <span className="flex items-center gap-1">
          {solo ? (
            <User
              className="size-3.5 text-bum-graphite"
              aria-label={t('map.solo-viable', { defaultValue: 'Playable alone' })}
            />
          ) : (
            <Lock
              className="size-3.5 text-bum-graphite"
              aria-label={t('map.needs-two', { defaultValue: 'Needs two players' })}
            />
          )}
          {cleared ? (
            <Check
              className="size-4 text-bum-success"
              aria-label={t('map.cleared', { defaultValue: 'Cleared' })}
            />
          ) : null}
        </span>
      </span>
      <span className="text-sm leading-snug font-medium text-balance text-bum-ink">{label}</span>
    </button>
  );
}
