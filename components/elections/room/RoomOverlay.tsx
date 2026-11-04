import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import {
  Columns2,
  Copy,
  Grid2x2,
  GripVertical,
  LayoutPanelLeft,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Rows2,
  Square,
  X,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import type { ElectionEvent } from '@/lib/elections/events';
import {
  LAYOUTS,
  PANE_KINDS,
  newPane,
  visiblePanes,
  withLayout,
  withPane,
  type Layout,
  type Pane,
  type PaneKind,
} from '@/lib/elections/room-config';
import { REACTIONS, roomPath, tallyReactions } from '@/lib/elections/rooms';
import { SITE_URL } from '@/lib/seo';
import type { ElectionSnapshot } from '@/lib/elections/types';
import { useNow } from '../hooks';
import { useRoomStream } from '../useRoomStream';
import {
  ChatBody,
  EventsBody,
  MapBody,
  RaceBody,
  StreamBody,
  WireBody,
  type PaneContext,
} from './panes';
import { useRoomState, writeSolo, type RoomSource } from './useRoomState';
import { useSplit } from './useSplit';
import {
  BORDER_LABELS,
  SPACE_LABELS,
  SPACE_PX,
  dividers,
  lookVars,
  nudgeId,
  orderPanes,
  parseLook,
  splitVars,
  swapIds,
  DEFAULT_LOOK,
  type Look,
} from '@/lib/elections/split';

const LAYOUT_ICON: Record<Layout, typeof Square> = {
  '1': Square,
  '2h': Columns2,
  '2v': Rows2,
  '3l': LayoutPanelLeft,
  '4': Grid2x2,
};
const LAYOUT_LABEL: Record<Layout, [string, string]> = {
  '1': ['layout.1', 'One pane'],
  '2h': ['layout.2h', 'Side by side'],
  '2v': ['layout.2v', 'Stacked'],
  '3l': ['layout.3l', 'One big, two small'],
  '4': ['layout.4', 'Four panes'],
};
const KIND_LABEL: Record<PaneKind, [string, string]> = {
  stream: ['kind.stream', 'Stream'],
  race: ['kind.race', 'Race'],
  graph: ['kind.graph', 'Live graph'],
  map: ['kind.map', 'Map'],
  wire: ['kind.wire', 'News wire'],
  chat: ['kind.chat', 'Chat'],
  events: ['kind.events', 'Events'],
};

/**
 * The Briefing Room: a full-screen overlay of up to four panes — streams (several services at once),
 * races, live graphs, the map, the news wire, chat and the event feed. Solo rooms live in this browser;
 * hosted rooms (private by code, or public) are edited by their host and followed live by everyone else.
 *
 * It is a real modal, built on Radix's dialog so the hard parts are not hand-rolled: it traps focus, locks
 * page scroll, closes on Escape (unless the browser is in fullscreen, where Escape leaves that first),
 * returns focus to what opened it, and renders into <body> so nothing in the page can clip or cover it.
 * Reactions float across it for everyone in the same room.
 */
/** Read the saved bar choice synchronously (the open-focus decision happens before state has loaded it). */
function localStorageBarIsAuto(): boolean {
  try {
    return localStorage.getItem('rmh-elections-roombar') === 'auto';
  } catch {
    return false;
  }
}

export function RoomOverlay({
  cycle,
  source,
  snapshot,
  events,
  live,
  onClose,
  onUseSolo,
}: {
  cycle: string;
  source: RoomSource;
  snapshot: ElectionSnapshot | undefined;
  events: ElectionEvent[];
  live: boolean;
  onClose: () => void;
  /** Guest chose "make my own copy": the page reopens the overlay as a solo room. */
  onUseSolo: () => void;
}) {
  const { t } = useTranslation('c-elections');
  const { data: session } = useSession();
  const code = source.kind === 'hosted' ? source.code : null;
  const { config, setConfig, meta, status, canEdit, applyRemote } = useRoomState(cycle, source);
  const chat = useRoomStream(cycle, code, applyRemote);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phones show one pane at a time (a switcher picks it); wider screens show the whole layout.
  const [mobilePane, setMobilePane] = useState(0);
  // How the panes sit: spacing and border size (None … Roomy / Thick), per viewer, kept in this browser.
  const [look, setLookState] = useState<Look>(DEFAULT_LOOK);
  useEffect(() => {
    try {
      setLookState(parseLook(localStorage.getItem('rmh-elections-roomlook')));
    } catch {
      /* defaults */
    }
  }, []);
  const setLook = (next: Look) => {
    setLookState(next);
    try {
      localStorage.setItem('rmh-elections-roomlook', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  // Pane order is also per viewer: drag a pane's grip onto another to swap them.
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('rmh-elections-roomorder') ?? '{}') as Record<string, unknown>;
      const clean: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) clean[k] = v.filter((x): x is string => typeof x === 'string').slice(0, 8);
      setOrders(clean);
    } catch {
      /* default order */
    }
  }, []);
  const saveOrder = (layout: string, ids: string[]) =>
    setOrders((cur) => {
      const next = { ...cur, [layout]: ids };
      try {
        localStorage.setItem('rmh-elections-roomorder', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const { split, grid, dragging, handlers } = useSplit(config.layout, SPACE_PX[look.space] ?? 4, SPACE_PX[look.space] ?? 4);
  // The room's top bar can hide until the pointer (or keyboard focus) reaches the top edge, giving the panes the
  // whole screen. The choice is per viewer, kept in this browser.
  const [autoHide, setAutoHide] = useState(false);
  useEffect(() => {
    try {
      setAutoHide(localStorage.getItem('rmh-elections-roombar') === 'auto');
    } catch {
      /* private mode: the bar stays pinned */
    }
  }, []);
  // Open/close the hidden bar from pointer events (a data attribute, not :hover — the site's CSS pipeline strips
  // hand-written hover transforms). A short grace timer lets the pointer travel from the strip into the bar.
  const [barOpen, setBarOpen] = useState(false);
  const barTimer = useRef<number | undefined>(undefined);
  const openBar = (e?: React.PointerEvent) => {
    // A finger "entering" the bar is just the tap that is about to toggle the pin; only a deliberate touch on the
    // strip opens it (and it then closes itself after a few seconds, or on a tap elsewhere).
    if (e?.pointerType === 'touch' && e.type !== 'pointerdown') return;
    window.clearTimeout(barTimer.current);
    setBarOpen(true);
    if (e?.pointerType === 'touch') barTimer.current = window.setTimeout(() => setBarOpen(false), 6000);
  };
  const closeBar = (e?: React.PointerEvent) => {
    // Touch has no hover: a tap opens the bar and a tap anywhere else closes it (below), so leaving is not a close.
    if (e?.pointerType === 'touch') return;
    window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => setBarOpen(false), 350);
  };
  useEffect(() => {
    if (!barOpen) return;
    const away = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !(e.target as Element | null)?.closest?.('.el-room__bar, .el-room__hot')) setBarOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [barOpen]);
  const toggleAutoHide = () => {
    // Switching modes puts the bar away at once (the pointer is still over it, which would otherwise hold it open).
    window.clearTimeout(barTimer.current);
    setBarOpen(false);
    setAutoHide((v) => {
      try {
        localStorage.setItem('rmh-elections-roombar', v ? 'pinned' : 'auto');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  const root = useRef<HTMLDivElement | null>(null);
  const now = useNow(500);

  // Radix owns focus, scroll lock and Escape; the only thing left is tracking (and leaving) fullscreen.
  useEffect(() => {
    const fs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fs);
    return () => {
      document.removeEventListener('fullscreenchange', fs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const react = (emoji: string) =>
    fetch('/api/elections/chat/react', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ cycle, emoji, ...(code ? { room: code } : {}) }),
    }).catch(() => undefined);

  const inviteUrl = code ? `${SITE_URL}${roomPath(code)}` : null;
  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt(t('room.copyPrompt', { defaultValue: 'Copy the invite link:' }), inviteUrl);
    }
  };

  const copyToSolo = () => {
    writeSolo(cycle, config);
    onUseSolo();
  };

  const panes = orderPanes(visiblePanes(config), orders[config.layout]);
  const recent = useMemo(
    () => chat.reactions.filter((r) => (now ? now.getTime() - r.at < 3_000 : false)),
    [chat.reactions, now],
  );
  const tally = useMemo(
    () => tallyReactions(chat.reactions, now ? now.getTime() : 0),
    [chat.reactions, now],
  );

  const ctxFor = (pane: Pane): PaneContext => ({
    cycle,
    snapshot,
    events,
    live,
    selectedState,
    setSelectedState,
    room: code,
    canModerate: Boolean(meta?.mine && code),
    chat,
    canEdit,
    onChange: (next) => setConfig(withPane(config, pane.id, next)),
  });

  const body = (pane: Pane) => {
    const ctx = ctxFor(pane);
    switch (pane.kind) {
      case 'stream':
        return <StreamBody pane={pane} ctx={ctx} />;
      case 'race':
        return <RaceBody pane={pane} ctx={ctx} graph={false} />;
      case 'graph':
        return <RaceBody pane={pane} ctx={ctx} graph />;
      case 'map':
        return <MapBody pane={pane} ctx={ctx} />;
      case 'wire':
        return <WireBody pane={pane} ctx={ctx} />;
      case 'chat':
        return <ChatBody ctx={ctx} />;
      case 'events':
        return <EventsBody ctx={ctx} />;
    }
  };

  const title = meta?.name ?? t('room.loading', { defaultValue: 'Room' });
  const badge =
    meta?.visibility === 'SOLO'
      ? t('room.solo', { defaultValue: 'Solo' })
      : meta?.visibility === 'PUBLIC'
        ? t('room.public', { defaultValue: 'Public' })
        : t('room.private', { defaultValue: 'Private' });

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={root}
          className="el-root el-room"
          data-bar={autoHide ? 'auto' : 'pinned'}
          data-bar-open={autoHide && barOpen ? '' : undefined}
          aria-describedby={undefined}
          data-animate=""
          // In browser fullscreen, Escape leaves fullscreen first; a second press closes the room.
          onEscapeKeyDown={(e) => document.fullscreenElement && e.preventDefault()}
          // With the bar hidden, opening the room must not focus a control inside it (focus keeps it visible).
          onOpenAutoFocus={(e) => {
            if (localStorageBarIsAuto()) {
              e.preventDefault();
              root.current?.focus();
            }
          }}
          tabIndex={-1}
        >
          <DialogPrimitive.Title className="el-sr">
            {t('room.briefingAria', { defaultValue: 'Briefing Room: {{name}}', name: title })}
          </DialogPrimitive.Title>
          {autoHide ? <div className="el-room__hot" aria-hidden onPointerEnter={openBar} onPointerLeave={closeBar} onPointerDown={openBar} /> : null}
          <header className="el-room__bar" onPointerEnter={autoHide ? openBar : undefined} onPointerLeave={autoHide ? closeBar : undefined}>
            <div className="el-room__title">
              <strong>{title}</strong> <span className="el-chip el-chip--yellow">{badge}</span>
              {meta?.owner?.name && meta.visibility !== 'SOLO' ? (
                <span className="el-eyebrow">
                  {' '}
                  {t('room.host', { defaultValue: 'hosted by {{name}}', name: meta.owner.name })}
                </span>
              ) : null}
            </div>

            <div className="el-room__tools">
              <div
                role="group"
                aria-label={t('room.layout', { defaultValue: 'Layout' })}
                className="el-room__layouts"
              >
                {LAYOUTS.map((l) => {
                  const Icon = LAYOUT_ICON[l];
                  const label = t(LAYOUT_LABEL[l][0], { defaultValue: LAYOUT_LABEL[l][1] });
                  return (
                    <button
                      key={l}
                      type="button"
                      className="el-btn el-btn--sm"
                      aria-pressed={config.layout === l}
                      aria-label={label}
                      title={label}
                      disabled={!canEdit}
                      onClick={() => setConfig(withLayout(config, l))}
                    >
                      <Icon size={16} aria-hidden />
                    </button>
                  );
                })}
              </div>
              {inviteUrl ? (
                <button
                  type="button"
                  className="el-btn el-btn--sm el-btn--ghost"
                  onClick={copy}
                  title={inviteUrl}
                >
                  <Copy size={14} aria-hidden />{' '}
                  {copied
                    ? t('room.copied', { defaultValue: 'Copied' })
                    : t('room.invite', { defaultValue: 'Invite' })}{' '}
                  <span className="el-mono">{code}</span>
                </button>
              ) : null}
              <span className="el-room__look" role="group" aria-label={t('room.look', { defaultValue: 'Pane spacing and borders' })}>
                <label className="el-sr" htmlFor="el-room-space">{t('room.space', { defaultValue: 'Spacing' })}</label>
                <select
                  id="el-room-space"
                  className="el-input"
                  value={look.space}
                  title={t('room.space', { defaultValue: 'Spacing' })}
                  onChange={(e) => setLook({ ...look, space: Number(e.target.value) })}
                >
                  {SPACE_LABELS.map((label, i) => (
                    <option key={label} value={i}>{t('room.spaceOpt', { defaultValue: 'Spacing: {{size}}', size: label })}</option>
                  ))}
                </select>
                <label className="el-sr" htmlFor="el-room-border">{t('room.border', { defaultValue: 'Borders' })}</label>
                <select
                  id="el-room-border"
                  className="el-input"
                  value={look.border}
                  title={t('room.border', { defaultValue: 'Borders' })}
                  onChange={(e) => setLook({ ...look, border: Number(e.target.value) })}
                >
                  {BORDER_LABELS.map((label, i) => (
                    <option key={label} value={i}>{t('room.borderOpt', { defaultValue: 'Borders: {{size}}', size: label })}</option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                className="el-btn el-btn--sm el-btn--ghost"
                onClick={(e) => {
                  toggleAutoHide();
                  // A mouse click would leave focus inside the bar and keep it open; keyboard users keep their focus.
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                aria-pressed={autoHide}
                title={autoHide ? t('room.pinBars', { defaultValue: 'Keep the bars visible' }) : t('room.hideBars', { defaultValue: 'Hide the room bar and pane headers until hovered' })}
                aria-label={autoHide ? t('room.pinBars', { defaultValue: 'Keep the bars visible' }) : t('room.hideBars', { defaultValue: 'Hide the room bar and pane headers until hovered' })}
              >
                {autoHide ? <Pin size={14} aria-hidden /> : <PinOff size={14} aria-hidden />}
                <span className="el-room__lbl">
                  {autoHide ? t('room.barPinned', { defaultValue: 'Show bars' }) : t('room.barHide', { defaultValue: 'Hide bars' })}
                </span>
              </button>
              <button
                type="button"
                className="el-btn el-btn--sm el-btn--ghost"
                onClick={toggleFullscreen}
                aria-pressed={fullscreen}
              >
                {fullscreen ? (
                  <Minimize2 size={14} aria-hidden />
                ) : (
                  <Maximize2 size={14} aria-hidden />
                )}
                <span className="el-room__lbl">
                  {t('room.fullscreen', { defaultValue: 'Fullscreen' })}
                </span>
              </button>
              <button
                type="button"
                className="el-btn el-btn--sm el-btn--gop"
                onClick={onClose}
                aria-label={t('room.close', { defaultValue: 'Close room' })}
              >
                <X size={16} aria-hidden />{' '}
                <span className="el-room__lbl">{t('room.exit', { defaultValue: 'Exit' })}</span>
              </button>
            </div>
          </header>

          {source.kind === 'hosted' && meta && !meta.mine ? (
            <p className="el-room__note">
              {t('room.guest', { defaultValue: 'The host controls this screen.' })}{' '}
              <button type="button" className="el-btn el-btn--sm el-btn--pink" onClick={copyToSolo}>
                {t('room.copySolo', { defaultValue: 'Make my own copy' })}
              </button>
            </p>
          ) : null}

          {status === 'loading' ? (
            <p className="el-room__note" aria-busy>
              {t('room.joining', { defaultValue: 'Joining…' })}
            </p>
          ) : status === 'not-found' ? (
            <div className="el-room__note">
              <p>{t('room.gone', { defaultValue: 'That room does not exist or has ended.' })}</p>
              <button type="button" className="el-btn" onClick={onUseSolo}>
                {t('room.startSolo', { defaultValue: 'Start a solo room instead' })}
              </button>
            </div>
          ) : status === 'error' ? (
            <p className="el-room__note" role="alert">
              {t('room.error', { defaultValue: 'Could not load the room. Try again.' })}
            </p>
          ) : (
            <>
            <div className="el-room__switch" role="group" aria-label={t('room.panes', { defaultValue: 'Panes' })}>
              {panes.map((pane, i) => (
                <button
                  key={pane.id}
                  type="button"
                  className="el-btn el-btn--sm"
                  aria-pressed={Math.min(mobilePane, panes.length - 1) === i}
                  onClick={() => setMobilePane(i)}
                >
                  {t(KIND_LABEL[pane.kind][0], { defaultValue: KIND_LABEL[pane.kind][1] })}
                </button>
              ))}
            </div>
            <div
              ref={grid}
              className="el-room__grid"
              data-layout={config.layout}
              data-dragging={dragging ?? (dragId ? 'pane' : undefined)}
              style={{ ...splitVars(split), ...lookVars(look) } as React.CSSProperties}
            >
              {panes.map((pane, i) => (
                <section
                  key={pane.id}
                  className="el-room__pane"
                  data-slot={i}
                  data-active={Math.min(mobilePane, panes.length - 1) === i}
                  data-drop={dragId && overId === pane.id && dragId !== pane.id ? '' : undefined}
                  onDragOver={(e) => {
                    if (!dragId || dragId === pane.id) return;
                    e.preventDefault();
                    setOverId(pane.id);
                  }}
                  onDragLeave={() => setOverId((cur) => (cur === pane.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== pane.id) saveOrder(config.layout, swapIds(panes.map((p) => p.id), dragId, pane.id));
                    setDragId(null);
                    setOverId(null);
                  }}
                  aria-label={t(KIND_LABEL[pane.kind][0], {
                    defaultValue: KIND_LABEL[pane.kind][1],
                  })}
                >
                  {autoHide ? <div className="el-room__panehot" aria-hidden /> : null}
                  <div className="el-room__panebar">
                    {panes.length > 1 ? (
                      <span
                        className="el-room__grip"
                        role="button"
                        tabIndex={0}
                        draggable
                        aria-label={t('room.movePane', { defaultValue: 'Move this pane: drag it onto another pane, or press the arrow keys' })}
                        title={t('room.movePaneTip', { defaultValue: 'Drag onto another pane to swap' })}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', `pane:${pane.id}`);
                          const sec = e.currentTarget.closest('section');
                          if (sec) e.dataTransfer.setDragImage(sec, 24, 12);
                          setDragId(pane.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                        }}
                        onKeyDown={(e) => {
                          const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
                          if (!dir) return;
                          e.preventDefault();
                          saveOrder(config.layout, nudgeId(panes.map((p) => p.id), pane.id, dir));
                        }}
                      >
                        <GripVertical size={16} aria-hidden />
                      </span>
                    ) : null}
                    {canEdit ? (
                      <>
                        <label className="el-sr" htmlFor={`kind-${pane.id}`}>
                          {t('room.paneKind', { defaultValue: 'Pane content' })}
                        </label>
                        <select
                          id={`kind-${pane.id}`}
                          className="el-input"
                          style={{ minHeight: 30, padding: '0 6px', fontSize: 13 }}
                          value={pane.kind}
                          onChange={(e) =>
                            setConfig(
                              withPane(
                                config,
                                pane.id,
                                newPane(e.target.value as PaneKind, pane.id),
                              ),
                            )
                          }
                        >
                          {PANE_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {t(KIND_LABEL[k][0], { defaultValue: KIND_LABEL[k][1] })}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <strong className="el-eyebrow">
                        {t(KIND_LABEL[pane.kind][0], { defaultValue: KIND_LABEL[pane.kind][1] })}
                      </strong>
                    )}
                  </div>
                  <div className="el-room__panebody">{body(pane)}</div>
                </section>
              ))}
              {dividers(config.layout).col ? (
                <div
                  className={`el-split el-split--col${dividers(config.layout).rowsOnRight ? '' : ' el-split--full'}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t('split.col', { defaultValue: 'Resize panes: drag, or use the arrow keys. Double-click to reset.' })}
                  aria-valuemin={14}
                  aria-valuemax={86}
                  aria-valuenow={Math.round(split.c * 100)}
                  tabIndex={0}
                  {...handlers('c')}
                />
              ) : null}
              {dividers(config.layout).row ? (
                <div
                  className={`el-split el-split--row${dividers(config.layout).rowsOnRight ? ' el-split--right' : ''}`}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t('split.row', { defaultValue: 'Resize panes: drag, or use the arrow keys. Double-click to reset.' })}
                  aria-valuemin={14}
                  aria-valuemax={86}
                  aria-valuenow={Math.round(split.r * 100)}
                  tabIndex={0}
                  {...handlers('r')}
                />
              ) : null}
            </div>
            </>
          )}

          <footer className="el-room__foot">
            <div
              role="group"
              aria-label={t('room.react', { defaultValue: 'Reactions' })}
              className="el-room__reacts"
            >
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="el-btn el-btn--sm el-btn--ghost"
                  disabled={!session}
                  onClick={() => react(e)}
                  aria-label={t('room.reactWith', { defaultValue: 'React {{emoji}}', emoji: e })}
                >
                  <span aria-hidden>{e}</span>
                  {tally[e] ? (
                    <span className="el-mono" style={{ fontSize: 11 }}>
                      {tally[e]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {!session ? (
              <span className="el-eyebrow">
                {t('room.reactSignin', { defaultValue: 'Sign in to react and chat' })}
              </span>
            ) : null}
          </footer>

          <div className="el-room__float" aria-hidden>
            {recent.map((r) => (
              <span key={r.id} className="el-room__emoji" style={{ left: `${r.x}%` }}>
                {r.emoji}
              </span>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
