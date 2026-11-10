/**
 * Half-Life 2's and Portal's main menu as GameUI draws it, from the game's own files (the `<game>-menu`
 * channel, lib/tf2-game/client/menus/source-gameui.ts): the console background of the chapter reached
 * and gamemenu.res's entries. New Game opens GameUI's chapter dialog (the chapters' pictures and
 * titles), Load Game continues from the saved level start, Options opens the Options property sheet,
 * Quit leaves for the games list.
 *
 * The two games share this component and each wears its own look (source-menu.css, `.gui-hl2` /
 * `.gui-portal`): Half-Life 2 the worn olive-and-steel GameUI under the City 17 smog with the lambda,
 * Portal the clinical slate of an Aperture chamber with a blue and an orange portal ring. The title is
 * the game's logo (public/images/games/logos); the type is the self-hosted Barlow Condensed / Jost.
 *
 * Every entry is a real button (mouse, touch, Tab / arrows, Enter); the background, logo and dialogs'
 * pictures are decoration. Where the channel is not published yet the caller keeps its plain menu.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, X } from 'lucide-react';
import { useQuitGame } from '@/hooks/useQuitGame';
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
import type { SpGameId } from '@/lib/sp-game/client/sp-save';
import { cn } from '@/lib/utils';
import OptionsDialog from '../tf2-game/menus/OptionsDialog';
import { useMenuSource } from '../tf2-game/menus/use-menu-source';
import { moveFocus } from '../tf2-game/menu-nav';
import { ChapterArt, SOURCE_LOGOS, SourceBackdrop, SourceGlyph } from './source-art';
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

/** A VGUI frame: a title bar, the body, a close button (Escape closes too). */
function VguiFrame({
  game,
  title,
  onClose,
  children,
  className,
}: {
  game: SpGameId;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('c-tf2-game');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="gui-modal" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <section ref={ref} className={cn('gui-frame', className)} aria-label={title}>
        <header className="gui-frame-title">
          <SourceGlyph game={game} />
          <h2>{title}</h2>
          <button type="button" className="gui-frame-close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="gui-frame-body">{children}</div>
      </section>
    </div>
  );
}

export default function SourceMainMenu({ game, channel, chapters, savedChapter, onNewGame, onLoadGame }: SourceMainMenuProps) {
  const { t } = useTranslation('c-tf2-game');
  const quit = useQuitGame();
  const style = useMemo(() => gameUiStyle(channel), [channel]);
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
    if (!listed.length) return fallback;
    // gamemenu.res is the game's own list; Quit is how the player leaves, so it is always there.
    return listed.some((e) => e.action === 'quit')
      ? listed
      : [...listed, { label: '#GameUI_GameMenu_Quit', action: 'quit' as const, onlyInGame: false }];
  }, [channel]);
  const words: Record<SourceMenuAction, string> = {
    resume: t('menu_resume', { defaultValue: 'Resume game' }),
    newgame: t('play_new_game', { defaultValue: 'New game' }),
    loadgame: t('play_continue', { defaultValue: 'Continue' }),
    options: t('settings', { defaultValue: 'Options' }),
    quit: t('menu_quit', { defaultValue: 'Quit' }),
  };

  const title = parseGameTitle(channel.files['gameinfo.txt']);
  // The logo is the base game's; the alt text keeps an edition's own title ("Portal: The First Slice").
  const ownName = game === 'hl2' ? t('play_hl2_title', { defaultValue: 'Half-Life 2' }) : t('play_portal_title', { defaultValue: 'Portal' });
  const background = backgroundFor(channel, savedChapter ?? 0, aspect);

  const act = (a: SourceMenuAction) => {
    if (a === 'newgame') setDialog('newgame');
    else if (a === 'loadgame') onLoadGame();
    else if (a === 'options') setDialog('options');
    else if (a === 'quit') quit();
  };

  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={cn('gui-root', `gui-${game}`)} style={style.vars as CSSProperties}>
      <SourceBackdrop game={game} src={background ? menuAssetUrl(background, game) : null} />
      <div className="gui-main">
        <h1 className="gui-logo">
          <img src={SOURCE_LOGOS[game]} alt={title?.title || ownName} />
        </h1>
        <span className="gui-rule" aria-hidden />
        <nav aria-label={t('play_menu', { defaultValue: 'Main menu' })}>
          <ul
            ref={listRef}
            className="gui-menu"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (listRef.current) moveFocus(listRef.current, e.key === 'ArrowDown' ? 1 : -1);
              }
            }}
          >
            {entries.map((e, i) => {
              const disabled = e.action === 'loadgame' && savedChapter === null;
              return (
                <li key={`${e.action}${e.label}`} style={{ '--i': i } as CSSProperties}>
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
          game={game}
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
        <VguiFrame game={game} title={menuText(channel, '#GameUI_Options', words.options)} onClose={() => setDialog(null)} className="gui-frame-options">
          <div className="gui-skin">
            <OptionsDialog game={game} settings={settings} onChange={onSettings} source={source} />
          </div>
        </VguiFrame>
      ) : null}
    </div>
  );
}

/** GameUI's New Game dialog: the chapters in a row of pictures, the chosen one framed, Start / Cancel. */
function NewGameDialog({
  game,
  channel,
  chapters,
  onClose,
  onStart,
}: {
  game: SpGameId;
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
    <VguiFrame game={game} title={menuText(channel, '#GameUI_NewGame', t('play_new_game', { defaultValue: 'New game' }))} onClose={onClose} className="gui-frame-newgame">
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
                  <span className="gui-chapter-blank" aria-hidden>
                    <ChapterArt game={game} />
                  </span>
                )}
                <span className="gui-chapter-title">{c.title}</span>
                {!c.available ? (
                  <span className="gui-chapter-note">
                    <Lock className="size-3.5" aria-hidden />
                    {t('play_not_available', { defaultValue: 'Not available yet' })}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="gui-frame-buttons">
        <p className="gui-frame-status">
          <span>{chapterLabel(chosen)}</span>
          {chapters[chosen] ? <b>{chapters[chosen].title}</b> : null}
        </p>
        <button type="button" className="gui-button gui-button-primary" disabled={!ok} onClick={() => onStart(chosen)}>
          {menuText(channel, '#GameUI_StartNewGame', t('play_start_new_game', { defaultValue: 'Start new game' }))}
        </button>
        <button type="button" className="gui-button" onClick={onClose}>
          {menuText(channel, '#GameUI_Cancel', t('cancel', { defaultValue: 'Cancel' }))}
        </button>
      </footer>
    </VguiFrame>
  );
}
