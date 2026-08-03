/**
 * The navigation, in its two shapes.
 *
 * A real `role="tablist"` with arrow-key navigation, so every panel is
 * reachable without a mouse. Tabs whose panel holds something newly affordable
 * get a dot, which is the whole reason an idle game has tabs at all: to tell
 * you where to look next.
 *
 * On a desktop it is a RAIL in the dock's header. On a phone it is a BOTTOM
 * BAR, because that is what every idle game on a phone has and the reason is
 * measurable: as a rail it sat in the middle of the screen showing three of ten
 * destinations, and reaching the other seven meant a horizontal swipe on a
 * strip of pills that does not look like a scroller. As a bar it is in the
 * thumb's arc, it never scrolls, and the five slots hold the rooms you actually
 * visit — everything rarer goes behind More, which is the same bargain iOS has
 * made since 2007.
 *
 * Minigame tabs appear only once their source has been raised with Manna —
 * a rail of four locked buttons teaches nothing.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { GameState, TabId } from '@/lib/temple-of-joy/types';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { Glyph } from './ui';
import { computeAlerts } from './panels/alerts';

interface TabDef {
  id: TabId;
  glyph: string;
  label: string;
  /** Hide until the mechanic behind it exists. */
  visible?: (s: GameState) => boolean;
}

/**
 * How many slots the bottom bar has before it needs a More.
 *
 * Five is the ceiling on a 320px phone: below about 64px a slot cannot hold a
 * glyph over a legible label, and four leaves the bar looking half-empty on the
 * early game, where exactly five rooms are unlocked.
 */
const BAR_SLOTS = 5;

const TABS: TabDef[] = [
  { id: 'temple', glyph: '⛪', label: 'Temple' },
  { id: 'sources', glyph: '🕯️', label: 'Sources' },
  { id: 'blessings', glyph: '✨', label: 'Blessings' },
  { id: 'garden', glyph: '🌱', label: 'Garden', visible: (s) => s.garden.unlocked },
  { id: 'choir', glyph: '🎼', label: 'Choir', visible: (s) => s.choir.unlocked },
  { id: 'exchange', glyph: '📈', label: 'Exchange', visible: (s) => s.exchange.unlocked },
  { id: 'hours', glyph: '📖', label: 'Hours', visible: (s) => s.hours.unlocked },
  { id: 'legacy', glyph: '☁️', label: 'Ladder', visible: (s) => s.grace > 0 || s.ascensions > 0 },
  { id: 'trophies', glyph: '🏆', label: 'Trophies' },
  { id: 'settings', glyph: '⚙️', label: 'Settings' },
];

/**
 * The bar's five slots, and what falls off the end of them.
 *
 * Shared by the bar and by the sheet that holds the remainder, so the two can
 * never disagree about which rooms are hidden — the bug that shape of code
 * always has.
 *
 * The room you are IN is always a slot, even when it lives under More: a bar
 * whose selected tab is invisible is a bar that has lost you. It takes the last
 * slot rather than being appended, so the count never grows and the others
 * never shift under a thumb that is already moving.
 */
function splitRooms(shown: TabDef[], active: TabId, variant: 'rail' | 'bar') {
  if (variant !== 'bar' || shown.length <= BAR_SLOTS) return { slots: shown, hidden: [] };

  let slots = shown.slice(0, BAR_SLOTS - 1);
  const hidden = shown.filter((tab) => !slots.includes(tab));
  if (hidden.some((tab) => tab.id === active)) {
    slots = [...slots.slice(0, BAR_SLOTS - 2), shown.find((tab) => tab.id === active)!];
  }
  return { slots, hidden };
}

/** The rooms this save has unlocked, plus which of them want attention. */
function useRooms() {
  const state = useTempleSnapshot(
    (s) => ({
      visible: TABS.filter((tab) => !tab.visible || tab.visible(s))
        .map((tab) => tab.id)
        .join(','),
      alerts: computeAlerts(s).join(','),
    }),
    700,
  );
  const visibleIds = state.visible.split(',').filter(Boolean) as TabId[];
  return {
    shown: TABS.filter((tab) => visibleIds.includes(tab.id)),
    alerts: new Set(state.alerts.split(',').filter(Boolean)),
  };
}

export function TempleTabs({
  variant = 'rail',
  more = false,
  onMore,
}: {
  variant?: 'rail' | 'bar';
  /** Whether the overflow sheet is open — for the More button's `aria-expanded`
      only. The sheet itself is rendered by the shell, outside the subtree that
      goes `inert` while it is up. */
  more?: boolean;
  onMore?: (open: boolean) => void;
}) {
  const { t } = useTranslation('c-temple-of-joy');
  const active = useTempleValue((s) => s.tab);
  const railRef = useRef<HTMLDivElement>(null);

  const { shown, alerts } = useRooms();
  const { slots, hidden } = splitRooms(shown, active, variant);
  const moreAlert = hidden.some((tab) => alerts.has(tab.id) && tab.id !== active);

  /**
   * Left/Right walk the rail; Home/End jump to its ends.
   *
   * Over the SLOTS, not over every unlocked room: on the bar the rest are
   * behind More and have no button to focus, so walking onto one used to move
   * the game to a room and leave the focus ring where it was.
   */
  // No `useCallback`: the handler closes over `slots`, which is a fresh array
  // every render, so the memo could only ever be kept by hashing it into the
  // dependency list — which the compiler rejects, and rightly. The React
  // Compiler memoizes this correctly on its own.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const slotIds = slots.map((tab) => tab.id);
    const index = slotIds.indexOf(active);
    // The rail is laid out in the writing direction, so in RTL the left arrow
    // should move to the *next* tab, not the previous one.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step = event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : rtl ? -1 : 1;

    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? slotIds.length - 1
          : (index + step + slotIds.length) % slotIds.length;

    const target = slotIds[next];
    if (!target) return;
    templeAudio.play('tab');
    useTempleStore.getState().setTab(target);
    railRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target}"]`)?.focus();
  };

  const tabButton = (tab: TabDef) => {
    const selected = tab.id === active;
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        data-tab={tab.id}
        aria-selected={selected}
        aria-controls="toj-panel"
        // Roving tabindex: one stop for the whole rail, then arrow keys.
        tabIndex={selected ? 0 : -1}
        className="toj-tab"
        onClick={() => {
          templeAudio.play('tab');
          useTempleStore.getState().setTab(tab.id);
        }}
      >
        <span className="toj-tab-glyph">
          <Glyph>{tab.glyph}</Glyph>
        </span>
        {/* An element, not a bare text node: on the desktop rail the tabs
            are grid cells of equal width, and only a real box can be told
            to ellipsise the one locale where "Blessings" is two words. */}
        <span className="toj-tab-label">{t(`tab-${tab.id}`, { defaultValue: tab.label })}</span>
        {alerts.has(tab.id) && !selected && <span className="toj-tab-dot" aria-hidden />}
      </button>
    );
  };

  return (
    <>
      <div
        ref={railRef}
        className="toj-tabs"
        data-variant={variant}
        role="tablist"
        aria-label={t('temple-sections', { defaultValue: 'Temple sections' })}
        onKeyDown={onKeyDown}
      >
        {slots.map(tabButton)}

        {hidden.length > 0 && (
          <button
            type="button"
            className="toj-tab"
            data-more="true"
            aria-haspopup="dialog"
            aria-expanded={more}
            onClick={() => {
              templeAudio.play('tab');
              onMore?.(true);
            }}
          >
            <span className="toj-tab-glyph">
              <Glyph>⋯</Glyph>
            </span>
            <span className="toj-tab-label">{t('tab-more', { defaultValue: 'More' })}</span>
            {moreAlert && <span className="toj-tab-dot" aria-hidden />}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * The rooms that did not fit, as a grid.
 *
 * A sheet rather than a menu: these are places, not commands, and a phone-width
 * grid of glyph-over-label reads as a set of doors — which is exactly what the
 * bar's five slots read as, so nothing has to be learned twice.
 *
 * Rendered by the shell rather than by the bar, and OUTSIDE the subtree the
 * shell marks `inert` while it is open — a dialog inside the thing it disables
 * disables itself.
 */
export function TempleRooms({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-temple-of-joy');
  const active = useTempleValue((s) => s.tab);
  const { shown, alerts } = useRooms();
  const { hidden } = splitRooms(shown, active, 'bar');

  return (
    <MoreSheet
      tabs={hidden}
      alerts={alerts}
      active={active}
      onClose={onClose}
      label={t('temple-sections', { defaultValue: 'Temple sections' })}
    />
  );
}

function MoreSheet({
  tabs,
  alerts,
  active,
  onClose,
  label,
}: {
  tabs: TabDef[];
  alerts: Set<string>;
  active: TabId;
  onClose: () => void;
  label: string;
}) {
  const { t } = useTranslation('c-temple-of-joy');
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="toj-scrim"
      data-sheet="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="toj-sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <span className="toj-sheet-grip" aria-hidden />
        <div className="toj-sheet-grid">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="toj-sheet-tab"
              aria-current={tab.id === active ? 'page' : undefined}
              onClick={() => {
                templeAudio.play('tab');
                useTempleStore.getState().setTab(tab.id);
                onClose();
              }}
            >
              <span className="toj-sheet-glyph">
                <Glyph>{tab.glyph}</Glyph>
              </span>
              <span>{t(`tab-${tab.id}`, { defaultValue: tab.label })}</span>
              {alerts.has(tab.id) && tab.id !== active && (
                <span className="toj-tab-dot" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
