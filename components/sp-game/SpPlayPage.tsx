/**
 * The Half-Life 2 / Portal play page: the game's main menu and the game itself in the shared
 * GameCanvas. The menu is GameUI's own (SourceMainMenu: the game's background, title, gamemenu.res,
 * New Game and Options dialogs, from the `<game>-menu` channel); before that channel is published, a
 * plain menu with the same choices stands in. "Continue" / Load Game is a level start saved in
 * localStorage (lib/tf2-game/client/sp-save.ts); a level the asset channel has not published shows as
 * unavailable.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { GAME_MAPS } from '@/lib/tf2-game/assets/game-maps';
import { fetchGameJson } from '@/lib/tf2-game/assets/urls';
import type { MapIndex } from '@/lib/tf2-game/assets/map-manifest';
import { createSpClient } from '@/lib/tf2-game/client/sp-client';
import { loadMenuChannel, type MenuChannel } from '@/lib/tf2-game/client/menus/source-gameui';
import { languageForSite } from '@/lib/tf2-hud/localisation';
import { clearSave, loadSave, type SpGameId, type SpSave } from '@/lib/tf2-game/client/sp-save';
import type { TransitionData } from '@/lib/sp-game/level/transition';
import { cn } from '@/lib/utils';
import SourceLoadingScreen from './SourceLoadingScreen';
import SourceMainMenu from './SourceMainMenu';
import './sp-game.css';

export interface SpPlayPageProps {
  game: SpGameId;
  /** Already-translated game title and the chapter names by map. */
  title: string;
  subtitle: string;
  chapters: Record<string, string>;
}

interface Running {
  map: string;
  transition: TransitionData | null;
  run: number;
}

export default function SpPlayPage({ game, title, subtitle, chapters }: SpPlayPageProps) {
  const { t } = useTranslation('c-tf2-game');
  const maps = GAME_MAPS[game];
  const names = useMemo(() => maps.map((m) => m.name), [maps]);
  const [save, setSave] = useState<SpSave | null>(null);
  const [published, setPublished] = useState<Set<string> | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  // The game's own GameUI (null until its menu channel loads; undefined: not published).
  const [channel, setChannel] = useState<MenuChannel | null | undefined>(null);
  useEffect(() => {
    let alive = true;
    const language = languageForSite(document.documentElement.lang || 'en', () => true);
    void loadMenuChannel(game, language).then((c) => alive && setChannel(c ?? undefined));
    return () => {
      alive = false;
    };
  }, [game]);

  useEffect(() => {
    setSave(loadSave(game, names));
    let alive = true;
    fetchGameJson<MapIndex>('maps/index.json', game)
      .then((idx) => alive && setPublished(new Set(Object.keys(idx?.maps ?? {}))))
      .catch(() => alive && setPublished(new Set()));
    return () => {
      alive = false;
    };
  }, [game, names, running]);

  const start = useCallback((map: string, transition: TransitionData | null) => {
    setRunning((r) => ({ map, transition, run: (r?.run ?? 0) + 1 }));
  }, []);
  const leave = useCallback(() => setRunning(null), []);
  const available = (map: string) => published === null || published.has(map);
  const first = maps.find((m) => available(m.name))?.name ?? maps[0]?.name;

  const theme = game === 'hl2' ? 'tf2hud-theme tf2g-hl2-theme' : 'tf2hud-theme tf2g-portal-theme';
  const savedTitle = save ? (chapters[save.map] ?? save.map) : '';

  if (channel) {
    const list = maps.map((m) => ({ map: m.name, title: chapters[m.name] ?? m.title, available: available(m.name) }));
    const savedAt = save && available(save.map) ? Math.max(0, names.indexOf(save.map)) : null;
    return (
      <AppShell appClassName={theme}>
        <main className="app-viewport">
          <SourceMainMenu
            game={game}
            channel={channel}
            chapters={list}
            savedChapter={savedAt}
            onNewGame={(i) => {
              clearSave(game);
              const map = list[i]?.map;
              if (map) start(map, null);
            }}
            onLoadGame={() => save && start(save.map, save.transition)}
          />
        </main>
        {running ? (
          <div className="tf2g-play-layer" key={running.run}>
            <GameCanvas
              game={game}
              sessionId={game === 'hl2' ? 'half-life-2' : 'portal'}
              title={chapters[running.map] ?? running.map}
              create={(mount) => createSpClient({ ...mount, game, map: running.map, transition: running.transition })}
              onExit={leave}
              loadingScreen={(view) => (
                <SourceLoadingScreen
                  game={game}
                  channel={channel}
                  chapter={Math.max(0, names.indexOf(running.map))}
                  view={view}
                />
              )}
            />
          </div>
        ) : null}
      </AppShell>
    );
  }

  return (
    <AppShell appClassName={theme}>
      <main className={cn('spg-menu app-page min-h-dvh bg-(--app-bg) text-(--app-text)', `spg-${game}`)}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pr-[calc(1rem_+_var(--safe-right,0px))] pb-16 pl-[calc(1rem_+_var(--safe-left,0px))] pt-[calc(var(--safe-top,0px)+1rem)]">
          <Link
            to="/games"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text)"
          >
            <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            {t('play_back_games', { defaultValue: 'Games' })}
          </Link>
          <header>
            <h1 className="spg-title text-5xl sm:text-6xl">{title}</h1>
            <p className="mt-2 text-sm text-(--app-text-muted)">{subtitle}</p>
          </header>

          <nav aria-label={t('play_menu', { defaultValue: 'Main menu' })} className="flex flex-col items-start gap-1">
            {save && available(save.map) ? (
              <button type="button" className="spg-item" onClick={() => start(save.map, save.transition)}>
                <Play className="size-4" aria-hidden />
                <span>
                  {t('play_continue', { defaultValue: 'Continue' })}
                  <span className="spg-item-note">{savedTitle}</span>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="spg-item"
              disabled={!first}
              onClick={() => {
                clearSave(game);
                if (first) start(first, null);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              <span>{t('play_new_game', { defaultValue: 'New game' })}</span>
            </button>
          </nav>

          <section aria-labelledby="spg-chapters">
            <h2 id="spg-chapters" className="mb-3 text-xs font-semibold uppercase tracking-widest text-(--app-text-dim)">
              {t('play_chapters', { defaultValue: 'Chapters' })}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {maps.map((m, i) => {
                const ok = available(m.name);
                return (
                  <li key={m.name}>
                    <button
                      type="button"
                      className="spg-chapter"
                      disabled={!ok}
                      onClick={() => start(m.name, null)}
                    >
                      <span className="text-xs tabular-nums text-(--app-text-dim)">
                        {t('play_chapter_n', { defaultValue: 'Chapter {{n}}', n: i + 1 })}
                      </span>
                      <span className="block text-base font-semibold">{chapters[m.name] ?? m.title}</span>
                      <span className="block font-mono text-xs text-(--app-text-dim)">{m.name}</span>
                      {!ok ? (
                        <span className="block text-xs text-(--app-text-muted)">
                          {t('play_not_available', { defaultValue: 'Not available yet' })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="text-xs text-(--app-text-dim)">
            {t('play_valve_legal', {
              defaultValue:
                'Runs on an independent, clean-room browser engine. Half-Life 2 and Portal and their content are trademarks and property of Valve Corporation; this fan project is not affiliated with Valve.',
            })}
          </p>
        </div>
      </main>
      {running ? (
        <div className="tf2g-play-layer" key={running.run}>
          <GameCanvas
            game={game}
            sessionId={game === 'hl2' ? 'half-life-2' : 'portal'}
            title={chapters[running.map] ?? running.map}
            create={(mount) => createSpClient({ ...mount, game, map: running.map, transition: running.transition })}
            onExit={leave}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
