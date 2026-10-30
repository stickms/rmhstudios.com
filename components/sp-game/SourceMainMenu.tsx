/**
 * Half-Life 2's and Portal's main menu as GameUI draws it, from the game's own files (the `<game>-menu`
 * channel, lib/tf2-game/client/menus/source-gameui.ts): the console background of the chapter reached,
 * the game's title (gameinfo.txt) in the scheme's ClientTitleFont, and gamemenu.res's entries in the
 * scheme's MenuLarge font and MainMenu colours. New Game opens GameUI's chapter dialog (the chapters'
 * pictures and titles), Load Game continues from the saved level start, Options opens the Options
 * property sheet in the scheme's colours, Quit leaves for the games list.
 *
 * Every entry is a real button (mouse, touch, Tab / arrows, Enter); the background, title and dialogs'
 * pictures are decoration. Where the channel is not published yet the caller keeps its plain menu.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  backgroundFor,
  gameUiStyle,
  menuAssetUrl,
  menuText,
  parseGameMenu,
  parseGameTitle,
  type MenuChannel,
  type SourceMenuAction,
} from '@/lib/tf2-game/client/menus/source-gameui';
import { loadSettings, saveSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import type { SpGameId } from '@/lib/tf2-game/client/sp-save';
import { cn } from '@/lib/utils';
import OptionsDialog from '../tf2-game/menus/OptionsDialog';
import { useMenuSource } from '../tf2-game/menus/use-menu-source';
import { moveFocus } from '../tf2-game/menu-nav';
import './source-menu.css';

export interface SourceChapter {
  map: string;
  title: string;
  available: boolean;
}

export interface SourceMainMenuProps {
  game: SpGameId;
  channel: MenuChannel;
  chapters: readonly SourceChapter[];
  /** The saved level start's chapter index (Load Game), or null when nothing is saved. */
  savedChapter: number | null;
  onNewGame: (chapter: number) => void;
  onLoadGame: () => void;
}

const registered = new Set<string>();

/** Registers the scheme's font files (once per page) so the title and menu draw in the game's type. */
export function useSchemeFonts(
  channel: MenuChannel,
  files: Array<{ family: string; file: string }>,
) {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const { family, file } of files) {
      const key = `${family}|${file}`;
      if (registered.has(key) || typeof FontFace === 'undefined') continue;
      registered.add(key);
      const face = new FontFace(family, `url(${menuAssetUrl(file, channel.game)})`);
      void face
        .load()
        .then((f) => {
          document.fonts.add(f);
          if (alive) setReady((n) => n + 1);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [channel, files]);
  return ready;
}

/** A VGUI frame: a title bar, the body, a close button (Escape closes too). */
function VguiFrame({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useTranslation('c-tf2-game');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="gui-modal" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <section ref={ref} className={cn('gui-frame', className)} aria-label={title}>
        <header className="gui-frame-title">
          <h2>{title}</h2>
          <button type="button" className="gui-frame-close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="gui-frame-body">{children}</div>
      </section>
    </div>
  );
}

export default function SourceMainMenu({ game, channel, chapters, savedChapter, onNewGame, onLoadGame }: SourceMainMenuProps) {
  const { t } = useTranslation('c-tf2-game');
  const navigate = useNavigate();
  const style = useMemo(() => gameUiStyle(channel), [channel]);
  useSchemeFonts(channel, style.fontFiles);
  const source = useMenuSource(game);
  const [dialog, setDialog] = useState<null | 'newgame' | 'options'>(null);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const measure = () => setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings(game));
  const onSettings = useCallback(
    (next: GameSettings) => {
      setSettings(next);
      saveSettings(game, next);
    },
    [game],
  );

  const entries = useMemo(() => {
    const listed = parseGameMenu(channel.files['resource/gamemenu.res']).filter((e) => !e.onlyInGame);
    // A file that lists none of them (or none at all) falls back to GameUI's own four.
    const fallback: Array<{ label: string; action: SourceMenuAction }> = [
      { label: '#GameUI_GameMenu_NewGame', action: 'newgame' },
      { label: '#GameUI_GameMenu_LoadGame', action: 'loadgame' },
      { label: '#GameUI_GameMenu_Options', action: 'options' },
      { label: '#GameUI_GameMenu_Quit', action: 'quit' },
    ];
    return listed.length ? listed : fallback;
  }, [channel]);
  const words: Record<SourceMenuAction, string> = {
    resume: t('menu_resume', { defaultValue: 'Resume game' }),
    newgame: t('play_new_game', { defaultValue: 'New game' }),
    loadgame: t('play_continue', { defaultValue: 'Continue' }),
    options: t('settings', { defaultValue: 'Options' }),
    quit: t('menu_quit', { defaultValue: 'Quit' }),
  };

  const title = parseGameTitle(channel.files['gameinfo.txt']);
  // The game's name without an edition's subtitle ("Portal: The First Slice" -> "Portal").
  const ownName = game === 'hl2' ? t('play_hl2_title', { defaultValue: 'Half-Life 2' }) : t('play_portal_title', { defaultValue: 'Portal' });
  const shownTitle = title?.title.split(':')[0].trim() || ownName;
  const background = backgroundFor(channel, savedChapter ?? 0, aspect);
  const logoFile = Object.entries(channel.index.images).find(([k]) => /logo/i.test(k) && !k.startsWith('console/'))?.[1];

  const act = (a: SourceMenuAction) => {
    if (a === 'newgame') setDialog('newgame');
    else if (a === 'loadgame') onLoadGame();
    else if (a === 'options') setDialog('options');
    else if (a === 'quit') void navigate({ to: '/games' });
  };

  // GameUI sizes fonts in units of a 480-line screen; on a narrow (portrait) screen the title is held to
  // the width too, and the entries never drop below a readable 16px.
  const font = (f: GameUiStyleFont | null, fallback: string, size: (tall: number) => string): CSSProperties =>
    f ? { fontFamily: `'${f.family}', ${fallback}`, fontWeight: f.weight || 400, fontSize: size(f.tall) } : { fontFamily: fallback };
  const titleSize = (tall: number) => `calc(min(var(--gui-u), var(--gui-uw)) * ${tall})`;
  const entrySize = (tall: number) => `max(1rem, calc(var(--gui-u) * ${tall}))`;

  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={cn('gui-root', `gui-${game}`)} style={style.vars as CSSProperties}>
      {background ? <img className="gui-background" src={menuAssetUrl(background, game)} alt="" aria-hidden /> : null}
      <div className="gui-main">
        {logoFile ? (
          <img className="gui-logo-image" src={menuAssetUrl(logoFile, game)} alt={title?.title ?? ''} />
        ) : (
          <h1 className="gui-logo" style={font(style.titleFont, 'Verdana, Tahoma, sans-serif', titleSize)}>
            <span>{shownTitle}</span>
            {title?.title2 ? <span className="gui-logo-2">{title.title2}</span> : null}
          </h1>
        )}
        <nav aria-label={t('play_menu', { defaultValue: 'Main menu' })}>
          <ul
            ref={listRef}
            className="gui-menu"
            style={font(style.menuFont, 'Verdana, Tahoma, sans-serif', entrySize)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (listRef.current) moveFocus(listRef.current, e.key === 'ArrowDown' ? 1 : -1);
              }
            }}
          >
            {entries.map((e) => {
              const disabled = e.action === 'loadgame' && savedChapter === null;
              return (
                <li key={`${e.action}${e.label}`}>
                  <button type="button" className="gui-menu-item" data-menu-item disabled={disabled} onClick={() => act(e.action)}>
                    {menuText(channel, e.label, words[e.action])}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {dialog === 'newgame' ? (
        <NewGameDialog
          channel={channel}
          chapters={chapters}
          onClose={() => setDialog(null)}
          onStart={(i) => {
            setDialog(null);
            onNewGame(i);
          }}
        />
      ) : null}
      {dialog === 'options' ? (
        <VguiFrame title={menuText(channel, '#GameUI_Options', words.options)} onClose={() => setDialog(null)} className="gui-frame-options">
          <div className="gui-skin">
            <OptionsDialog game={game} settings={settings} onChange={onSettings} source={source} />
          </div>
        </VguiFrame>
      ) : null}
    </div>
  );
}

type GameUiStyleFont = { family: string; tall: number; weight: number };

/** GameUI's New Game dialog: the chapters in a row of pictures, the chosen one framed, Start / Cancel. */
function NewGameDialog({
  channel,
  chapters,
  onClose,
  onStart,
}: {
  channel: MenuChannel;
  chapters: readonly SourceChapter[];
  onClose: () => void;
  onStart: (chapter: number) => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const [chosen, setChosen] = useState(() => Math.max(0, chapters.findIndex((c) => c.available)));
  const picture = (i: number) => channel.index.images[`vgui/chapters/chapter${i + 1}`];
  // GameUI's word ("CHAPTER", or a pattern with %s1) where the game has it, else this game's own.
  const word = channel.tokens.get('gameui_chapter');
  const chapterLabel = (i: number) =>
    word
      ? word.includes('%s1')
        ? word.replace('%s1', String(i + 1))
        : `${word} ${i + 1}`
      : t('play_chapter_n', { defaultValue: 'Chapter {{n}}', n: i + 1 });
  const ok = chapters[chosen]?.available ?? false;
  return (
    <VguiFrame title={menuText(channel, '#GameUI_NewGame', t('play_new_game', { defaultValue: 'New game' }))} onClose={onClose} className="gui-frame-newgame">
      <ul className="gui-chapters" aria-label={t('play_chapters', { defaultValue: 'Chapters' })}>
        {chapters.map((c, i) => {
          const pic = picture(i);
          return (
            <li key={c.map}>
              <button
                type="button"
                aria-pressed={i === chosen}
                className="gui-chapter"
                disabled={!c.available}
                onClick={() => setChosen(i)}
                onDoubleClick={() => c.available && onStart(i)}
              >
                <span className="gui-chapter-n">{chapterLabel(i)}</span>
                {pic ? (
                  <span className="gui-chapter-pic" aria-hidden>
                    <img src={menuAssetUrl(pic, channel.game)} alt="" />
                  </span>
                ) : (
                  <span className="gui-chapter-blank" aria-hidden />
                )}
                <span className="gui-chapter-title">{c.title}</span>
                {!c.available ? <span className="gui-chapter-note">{t('play_not_available', { defaultValue: 'Not available yet' })}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="gui-frame-buttons">
        <button type="button" className="gui-button" disabled={!ok} onClick={() => onStart(chosen)}>
          {menuText(channel, '#GameUI_StartNewGame', t('play_start_new_game', { defaultValue: 'Start new game' }))}
        </button>
        <button type="button" className="gui-button" onClick={onClose}>
          {menuText(channel, '#GameUI_Cancel', t('cancel', { defaultValue: 'Cancel' }))}
        </button>
      </footer>
    </VguiFrame>
  );
}
