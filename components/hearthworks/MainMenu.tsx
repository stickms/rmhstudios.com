'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Hammer, House, LogOut, UsersRound } from 'lucide-react';
import { useQuitGame } from '@/hooks/useQuitGame';
import {
  CloudStrip,
  Cog,
  FarIsland,
  FieldIsland,
  HeroIsland,
  Leaf,
  MarketIsland,
  MenuDefs,
  SkyCloud,
} from './MenuArt';
import './hearthworks-menu.css';

type Hot = 'start' | 'together' | 'quit' | null;

const LEAVES: Array<{ x: string; t: number; d: number; dx: string; s: number; kind: 'mint' | 'teal' }> = [
  { x: '8vw', t: 26, d: -4, dx: '16vw', s: 20, kind: 'mint' },
  { x: '22vw', t: 34, d: -19, dx: '-8vw', s: 15, kind: 'teal' },
  { x: '47vw', t: 30, d: -11, dx: '12vw', s: 24, kind: 'mint' },
  { x: '63vw', t: 38, d: -27, dx: '-14vw', s: 17, kind: 'teal' },
  { x: '78vw', t: 28, d: -8, dx: '10vw', s: 21, kind: 'mint' },
  { x: '92vw', t: 36, d: -22, dx: '-16vw', s: 14, kind: 'teal' },
];

const FLOATING_COGS: Array<{ x: string; y: string; s: number; t: number; d: number }> = [
  { x: '45%', y: '58%', s: 38, t: 5.4, d: -1 },
  { x: '51%', y: '67%', s: 22, t: 6.6, d: -3 },
  { x: '93%', y: '44%', s: 26, t: 6, d: -2 },
];

// Drift inside the stage's own width, so a cloud never passes behind the menu's text.
const SKY_CLOUDS: Array<{ y: string; w: number; t: number; d: number }> = [
  { y: '2%', w: 120, t: 120, d: -30 },
  { y: '36%', w: 90, t: 150, d: -95 },
  { y: '58%', w: 130, t: 180, d: -150 },
];

/**
 * Hearthworks' front screen. The world is already loaded behind it (HearthworksGame) and paused; Start / Continue
 * just lifts this screen away, so the game begins exactly as it always did. `onTogether` lifts it too and opens
 * the multiplayer panel. Quit is the game's only link out to /games.
 */
export function MainMenu({
  hasSave,
  onStart,
  onTogether,
}: {
  /** A saved town exists (or this visit already started one): the first entry reads Continue. */
  hasSave: boolean;
  onStart: () => void;
  onTogether: () => void;
}) {
  const { t } = useTranslation('c-hearthworks');
  const quit = useQuitGame();
  const [hot, setHot] = useState<Hot>(null);
  const nav = useRef<HTMLUListElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Keyboard and mouse players land on the primary action; a touch screen would only get a stray focus ring.
    if (window.matchMedia('(pointer: fine)').matches) startRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The world behind keeps window-level key handlers (camera pan, view toggle on Tab); the menu owns the keyboard.
    e.stopPropagation();
    const buttons = Array.from(nav.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => {
      e.preventDefault();
      buttons[(i + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(at + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(at < 0 ? buttons.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(buttons.length - 1);
    else if (e.key === 'Escape' && hasSave) {
      e.preventDefault();
      onStart();
    } else if (e.key === 'Enter' && at < 0) {
      e.preventDefault();
      onStart();
    }
  };

  const item = (hotKey: Exclude<Hot, null>) => ({
    onPointerEnter: () => setHot(hotKey),
    onPointerLeave: () => setHot((h) => (h === hotKey ? null : h)),
    onFocus: () => setHot(hotKey),
    onBlur: () => setHot((h) => (h === hotKey ? null : h)),
  });

  return (
    // The container only forwards keys to the buttons it holds; it is not itself interactive.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="hw-menu" data-hot={hot ?? undefined} onKeyDown={onKeyDown} onKeyUp={(e) => e.stopPropagation()}>
      <div className="hwm-scene" aria-hidden="true">
        <MenuDefs />
        <div className="hwm-plate" />
        <div className="hwm-wash" />
        <div className="hwm-sun" />
        <div className="hwm-row hwm-row--back">
          <CloudStrip row="back" />
          <CloudStrip row="back" />
          <CloudStrip row="back" />
          <CloudStrip row="back" />
        </div>
        {FLOATING_COGS.map((c, i) => (
          <svg
            key={i}
            className="hwm-fcog"
            viewBox="-12 -12 24 24"
            focusable="false"
            style={{ '--hwm-x': c.x, '--hwm-y': c.y, '--hwm-s': `${c.s}px`, '--hwm-t': `${c.t}s`, '--hwm-d': `${c.d}s` } as CSSProperties}
          >
            <Cog x={0} y={0} r={10} />
          </svg>
        ))}
        {LEAVES.map((l, i) => (
          <div
            key={i}
            className="hwm-fall"
            style={{ '--hwm-x': l.x, '--hwm-t': `${l.t}s`, '--hwm-d': `${l.d}s`, '--hwm-dx': l.dx, '--hwm-s': `${l.s}px` } as CSSProperties}
          >
            <div>
              <Leaf kind={l.kind} />
            </div>
          </div>
        ))}
      </div>

      <section className="app-screen hwm-screen" aria-label={t('menu-aria', { defaultValue: 'Hearthworks main menu' })}>
        <div className="hwm-col">
          <header className="hwm-head">
            <p className="hwm-kicker">{t('menu-kicker', { defaultValue: 'No. 5 · Sow any season' })}</p>
            <img className="hwm-logo" src="/images/games/logos/hearthworks.webp" alt="Hearthworks" width={1024} height={265} />
            <p className="hwm-tag">{t('menu-tagline', { defaultValue: 'Found a town. Plan it from above.' })}</p>
          </header>

          <nav className="hwm-navwrap" aria-label={t('menu-nav', { defaultValue: 'Menu' })}>
            <ul className="hwm-nav" ref={nav}>
              <li>
                <button
                  ref={startRef}
                  type="button"
                  className="hwm-item hwm-item--primary"
                  onClick={onStart}
                  {...item('start')}
                >
                  <span className="hwm-item__badge" aria-hidden="true">
                    {hasSave ? <House size={20} /> : <Hammer size={20} />}
                  </span>
                  <span className="hwm-item__text">
                    <span className="hwm-item__label">
                      {hasSave
                        ? t('menu-continue', { defaultValue: 'Continue' })
                        : t('menu-start', { defaultValue: 'Start building' })}
                    </span>
                    <span className="hwm-item__hint">
                      {hasSave
                        ? t('menu-continue-hint', { defaultValue: 'Pick up where you left off' })
                        : t('menu-start-hint', { defaultValue: 'Found a town on a floating island' })}
                    </span>
                  </span>
                  <ChevronRight className="hwm-item__go" size={18} aria-hidden="true" />
                </button>
              </li>
              <li>
                <button type="button" className="hwm-item" onClick={onTogether} {...item('together')}>
                  <span className="hwm-item__badge" aria-hidden="true">
                    <UsersRound size={20} />
                  </span>
                  <span className="hwm-item__text">
                    <span className="hwm-item__label">{t('mp-title', { defaultValue: 'Play together' })}</span>
                    <span className="hwm-item__hint">
                      {t('menu-together-hint', { defaultValue: 'Build side by side with friends' })}
                    </span>
                  </span>
                  <ChevronRight className="hwm-item__go" size={18} aria-hidden="true" />
                </button>
              </li>
              <li>
                <button type="button" className="hwm-item" onClick={quit} {...item('quit')}>
                  <span className="hwm-item__badge" aria-hidden="true">
                    <LogOut size={20} />
                  </span>
                  <span className="hwm-item__text">
                    <span className="hwm-item__label">{t('quit', { defaultValue: 'Quit' })}</span>
                    <span className="hwm-item__hint">{t('menu-quit-hint', { defaultValue: 'Back to all games' })}</span>
                  </span>
                  <ChevronRight className="hwm-item__go" size={18} aria-hidden="true" />
                </button>
              </li>
            </ul>
          </nav>

          <p className="hwm-fig">
            {t('menu-fig', { defaultValue: 'Fig. — Bird’s-eye view of a château and formal garden' })}
          </p>
        </div>

        <div className="hwm-stage" aria-hidden="true">
          {SKY_CLOUDS.map((c, i) => (
            <div
              key={i}
              className="hwm-sky-cloud"
              style={{ '--hwm-y': c.y, '--hwm-t': `${c.t}s`, '--hwm-d': `${c.d}s` } as CSSProperties}
            >
              <SkyCloud w={c.w} />
            </div>
          ))}
          <div className="hwm-isle hwm-isle--far">
            <FarIsland />
          </div>
          <div className="hwm-isle hwm-isle--field">
            <FieldIsland />
          </div>
          <div className="hwm-isle hwm-isle--market">
            <MarketIsland />
          </div>
          <div className="hwm-isle hwm-isle--hero">
            <HeroIsland />
          </div>
        </div>
      </section>

      <div className="hwm-scene hwm-scene--front" aria-hidden="true">
        <div className="hwm-row hwm-row--mid">
          <CloudStrip row="mid" />
          <CloudStrip row="mid" />
          <CloudStrip row="mid" />
          <CloudStrip row="mid" />
        </div>
        <div className="hwm-row hwm-row--front">
          <CloudStrip row="front" />
          <CloudStrip row="front" />
          <CloudStrip row="front" />
          <CloudStrip row="front" />
        </div>
      </div>
    </div>
  );
}
