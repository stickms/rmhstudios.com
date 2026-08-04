/**
 * Massive March — everything drawn over the world.
 *
 * The rule this HUD is built to is §9.2: no minimap, no quest markers, no
 * compass, no waypoint. Nothing here tells you where to go or where anybody is.
 * What it does show is the state of your own body and the machine you happen to
 * be standing in — which is information you would have by looking down.
 *
 * The one apparent exception is the time of day, and it earns its place: the sky
 * already tells you, and a group planning a walk needs to be able to say "we
 * have twenty minutes of light" without one of them having to stare at the
 * horizon.
 *
 * Everything is inside `.app-hud`, so an offset measured from its edges is
 * measured from the first pixel the phone's hardware does not cover.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudMoon, Sun, WifiOff, Mic, MicOff, Radio, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daylight, isNight } from '@/lib/massive-march/constants';
import { currentDayFraction, live } from '@/lib/massive-march/live';
import type { Interaction } from '@/lib/massive-march/interaction';
import { mm } from '@/lib/massive-march/net/client';
import { BIT } from '@/lib/massive-march/net/events';
import { LAND, TOY } from '@/lib/massive-march/palette';
import { useMmSettings } from '@/lib/massive-march/settings';
import { useMmStore } from '@/lib/massive-march/store';
import { hasMicrophone, isTransmitting } from '@/lib/massive-march/voice';
import { regionAt } from '@/lib/massive-march/world/regions';
import { BOARD, Chip, INK, MarchButton, Panel } from '../ui';
import { ChatInput, ChatLog } from './ChatPanel';
import { GestureWheel } from './GestureWheel';
import { carriedItems, InventorySheet, InventoryStrip } from './Inventory';
import { MapSheet } from './MapSheet';
import { RevealPanel } from './RevealPanel';
import { SettingsSheet } from './SettingsSheet';
import { SitePanel } from './SitePanel';
import { TouchControls } from './TouchControls';

export function Hud({
  locked,
  charge,
  onGrab,
  onInteract,
  getInteraction,
  blinded,
}: {
  locked: boolean;
  charge: number;
  onGrab: () => void;
  onInteract: () => void;
  getInteraction: () => Interaction;
  onNotify: (text: string, tone?: 'info' | 'good' | 'warn') => void;
  blinded: boolean;
}) {
  const { t } = useTranslation('c-massive-march');
  const overlay = useMmStore((s) => s.overlay);
  const setOverlay = useMmStore((s) => s.setOverlay);
  const chatOpen = useMmStore((s) => s.chatOpen);
  const nearSite = useMmStore((s) => s.nearSite);
  const reveal = useMmStore((s) => s.reveal);
  const notices = useMmStore((s) => s.notices);
  const dismiss = useMmStore((s) => s.dismissNotice);
  const connection = useMmStore((s) => s.connection);
  const variant = useMmStore((s) => s.session?.variant ?? 'duo');
  const world = useMmStore((s) => s.world);
  const largeText = useMmSettings((s) => s.largeText);
  const crosshair = useMmSettings((s) => s.crosshair);
  const stableFrame = useMmSettings((s) => s.stableFrame);

  const touch = useIsTouch();
  const [prompt, setPrompt] = useState<Interaction>({ kind: 'none', label: null });

  // Polled rather than derived from a render: the answer changes as you walk,
  // and walking does not re-render React.
  useEffect(() => {
    const timer = setInterval(() => setPrompt(getInteraction()), 160);
    return () => clearInterval(timer);
  }, [getInteraction]);

  // Notices clear themselves; a co-op game should not make anybody go and
  // dismiss six toasts before they can see the hillside again.
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => dismiss(notices[0].id), 5200);
    return () => clearTimeout(timer);
  }, [notices, dismiss]);

  const carried = carriedItems();
  const hasMap = carried.some((item) => item.kind === 'map');
  const orbs = carried.filter((item) => item.kind === 'orb').length;
  const modal = overlay !== 'none' || chatOpen;

  return (
    <div
      className={cn('app-hud pointer-events-none z-10', largeText && 'text-[1.08em]')}
      data-mm-hud
    >
      {/* ── Click to look ─────────────────────────────────────────────────── */}
      {!locked && !modal && !touch ? (
        <button
          type="button"
          onClick={onGrab}
          className="pointer-events-auto absolute inset-0 grid cursor-pointer place-items-center"
          style={{ background: 'rgba(12,14,20,0.55)' }}
        >
          <Panel className="max-w-sm space-y-2 text-center">
            <p className="text-lg font-black">
              {t('click-to-walk', { defaultValue: 'Click to walk' })}
            </p>
            <p className="text-xs leading-snug opacity-75">
              {t('click-hint', {
                defaultValue:
                  'WASD to walk · Shift to run · C to sit · E to pick up · F to throw · V to talk · Enter to type · M for the map · Esc to stop',
              })}
            </p>
          </Panel>
        </button>
      ) : null}

      {/* ── Top left: where and when ──────────────────────────────────────── */}
      <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
        <Clock />
        <Region />
        {orbs > 0 ? (
          <Chip color={TOY.red}>
            <span style={{ color: BOARD }}>
              {t('carrying-orbs', { defaultValue: '{{count}} red', count: orbs })}
            </span>
          </Chip>
        ) : null}
      </div>

      {/* ── Top right: connection and voice ───────────────────────────────── */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        {connection !== 'connected' ? (
          <Chip color={TOY.red}>
            <WifiOff aria-hidden className="size-3" style={{ color: BOARD }} />
            <span style={{ color: BOARD }}>
              {connection === 'reconnecting'
                ? t('reconnecting', { defaultValue: 'Reconnecting…' })
                : t('offline', { defaultValue: 'Offline' })}
            </span>
          </Chip>
        ) : null}
        <VoiceChip />
        {world?.finished ? <Chip color={TOY.green}>{t('finished-chip', { defaultValue: 'Walked through' })}</Chip> : null}
      </div>

      {/* ── Left: the installation you are standing in ────────────────────── */}
      {nearSite && !modal ? (
        <div className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2">
          <SitePanel siteId={nearSite} variant={variant} />
        </div>
      ) : null}

      {/* ── Right: what only you can see ──────────────────────────────────── */}
      {reveal && !modal ? (
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          <RevealPanel reveal={reveal} />
        </div>
      ) : null}

      {/* ── Centre: crosshair, prompt, notices ────────────────────────────── */}
      {locked || touch ? <Crosshair style={crosshair} /> : null}
      {stableFrame ? <SteadyFrame /> : null}

      {prompt.label && !modal ? (
        <div className="absolute bottom-[7.5rem] left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onInteract}
            className="pointer-events-auto cursor-pointer border-[3px] px-4 py-1.5 text-sm font-black"
            style={{ background: BOARD, borderColor: INK, color: INK, borderRadius: 3 }}
          >
            {prompt.label}
          </button>
        </div>
      ) : null}

      {charge > 0 ? (
        <div className="absolute bottom-[5.5rem] left-1/2 h-2 w-40 -translate-x-1/2 border-2" style={{ borderColor: INK, background: LAND.sandWet }}>
          <div className="h-full" style={{ width: `${charge * 100}%`, background: TOY.yellow }} />
        </div>
      ) : null}

      <ul className="absolute top-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {notices.map((notice) => (
          <li
            key={notice.id}
            className="border-2 px-3 py-1.5 text-sm font-bold"
            style={{
              background:
                notice.tone === 'good' ? TOY.green : notice.tone === 'warn' ? TOY.red : 'rgba(20,18,16,0.82)',
              color: BOARD,
              borderColor: INK,
              borderRadius: 3,
            }}
          >
            {notice.text}
          </li>
        ))}
      </ul>

      {/* ── Bottom left: what has been said ───────────────────────────────── */}
      <div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
        <ChatLog />
        {chatOpen ? <ChatInput /> : null}
      </div>

      {/* ── Bottom right: what you are holding ────────────────────────────── */}
      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
        <InventoryStrip />
      </div>

      {/* ── Blindfold ─────────────────────────────────────────────────────── */}
      {blinded ? (
        <div
          className="absolute inset-0"
          style={{ background: '#0b0a09', opacity: 0.985 }}
          aria-hidden
        >
          <p
            className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center text-xs font-black tracking-[0.2em] uppercase"
            style={{ color: 'rgba(247,243,232,0.45)' }}
          >
            {t('bucket-on', { defaultValue: 'You have a bucket on your head' })}
          </p>
        </div>
      ) : null}

      {touch && !modal ? <TouchControls onInteract={onInteract} /> : null}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {modal && overlay !== 'none' ? (
        <div className="pointer-events-auto absolute inset-0 grid items-center-safe justify-center-safe overflow-y-auto p-4" style={{ background: 'rgba(12,14,20,0.62)' }}>
          <div className="my-auto">
            {overlay === 'map' ? <MapSheet hasMap={hasMap} /> : null}
            {overlay === 'settings' ? <SettingsSheet /> : null}
            {overlay === 'inventory' ? <InventorySheet /> : null}
            {overlay === 'gestures' ? <GestureWheel onPick={() => setOverlay('none')} /> : null}
            {overlay === 'pause' ? <PauseSheet /> : null}
            <div className="mt-3 flex justify-center">
              <MarchButton tone="ghost" onClick={() => setOverlay('none')}>
                {t('close', { defaultValue: 'Back to the island' })}
              </MarchButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PauseSheet() {
  const { t } = useTranslation('c-massive-march');
  const setOverlay = useMmStore((s) => s.setOverlay);
  const setScreen = useMmStore((s) => s.setScreen);
  const leave = useMmStore((s) => s.leave);
  const session = useMmStore((s) => s.session);

  return (
    <Panel className="w-[min(22rem,88vw)] space-y-3">
      <h2 className="text-lg font-black tracking-tight">{session?.name}</h2>
      <p className="text-xs opacity-70">
        {t('paused-note', {
          defaultValue:
            'The island does not pause. Everyone else is still out there and the sun is still moving.',
        })}
      </p>
      <div className="flex flex-col gap-2">
        <MarchButton tone="primary" onClick={() => setOverlay('none')}>
          {t('resume-walk', { defaultValue: 'Keep walking' })}
        </MarchButton>
        <MarchButton onClick={() => setOverlay('settings')}>
          {t('settings', { defaultValue: 'Options' })}
        </MarchButton>
        <MarchButton onClick={() => setScreen('lobby')}>
          {t('back-to-landing', { defaultValue: 'Back to the lobby' })}
        </MarchButton>
        <MarchButton
          tone="danger"
          onClick={() => {
            mm.leave();
            leave();
          }}
        >
          {t('leave-walk', { defaultValue: 'Leave the walk' })}
        </MarchButton>
      </div>
    </Panel>
  );
}

function Clock() {
  const { t } = useTranslation('c-massive-march');
  const [fraction, setFraction] = useState(0.34);

  useEffect(() => {
    const timer = setInterval(() => setFraction(currentDayFraction()), 1500);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(fraction * 24);
  const minutes = Math.floor((fraction * 24 - hours) * 60);
  const night = isNight(fraction);
  const light = daylight(fraction);

  return (
    <Chip color={night ? 'rgba(20,18,16,0.82)' : BOARD}>
      {night ? (
        <CloudMoon aria-hidden className="size-3.5" style={{ color: BOARD }} />
      ) : (
        <Sun aria-hidden className="size-3.5" />
      )}
      <span style={{ color: night ? BOARD : INK }}>
        {`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`}
      </span>
      {light > 0 && light < 0.85 ? (
        <span className="opacity-70" style={{ color: night ? BOARD : INK }}>
          {fraction < 0.5
            ? t('getting-light', { defaultValue: 'getting light' })
            : t('getting-dark', { defaultValue: 'getting dark' })}
        </span>
      ) : null}
    </Chip>
  );
}

function Region() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setName(regionAt(live.self.x, live.self.z)?.name ?? null);
    }, 1200);
    return () => clearInterval(timer);
  }, []);
  if (!name) return null;
  return <Chip>{name}</Chip>;
}

function VoiceChip() {
  const { t } = useTranslation('c-massive-march');
  const textOnly = useMmSettings((s) => s.textOnly);
  const [state, setState] = useState({ on: false, radio: false, megaphone: false });

  useEffect(() => {
    const timer = setInterval(() => {
      setState({
        on: isTransmitting(),
        radio: (live.self.bits & BIT.RADIO) !== 0,
        megaphone: (live.self.bits & BIT.MEGAPHONE) !== 0,
      });
    }, 220);
    return () => clearInterval(timer);
  }, []);

  if (textOnly || !hasMicrophone()) {
    return (
      <Chip>
        <MicOff aria-hidden className="size-3.5" />
        {t('typing-only', { defaultValue: 'Typing' })}
      </Chip>
    );
  }

  return (
    <Chip color={state.on ? TOY.green : BOARD}>
      <Mic aria-hidden className="size-3.5" />
      {state.megaphone ? <Megaphone aria-hidden className="size-3.5" /> : null}
      {state.radio ? <Radio aria-hidden className="size-3.5" /> : null}
      {state.on ? t('talking', { defaultValue: 'Talking' }) : t('hold-v', { defaultValue: 'Hold V' })}
    </Chip>
  );
}

function Crosshair({ style }: { style: 'dot' | 'cross' | 'ring' | 'none' }) {
  if (style === 'none') return null;
  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 22 22">
        {style === 'dot' ? <circle cx="11" cy="11" r="2" fill="#fff" fillOpacity="0.75" /> : null}
        {style === 'ring' ? (
          <circle cx="11" cy="11" r="6" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.5" fill="none" />
        ) : null}
        {style === 'cross' ? (
          <>
            <line x1="11" y1="3" x2="11" y2="9" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />
            <line x1="11" y1="13" x2="11" y2="19" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />
            <line x1="3" y1="11" x2="9" y2="11" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />
            <line x1="13" y1="11" x2="19" y2="11" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

/**
 * A frame that does not move with the camera.
 *
 * The motion-reduction overlay from §17. It works by giving the eye something
 * fixed to hold on to while the world swings — the same principle as looking at
 * the horizon on a boat, except the horizon is a border on your own screen.
 */
function SteadyFrame() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div
        className="absolute inset-4"
        style={{ border: '2px solid rgba(247,243,232,0.28)', borderRadius: 6 }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-16 w-24 -translate-x-1/2"
        style={{
          background: 'linear-gradient(to top, rgba(247,243,232,0.16), transparent)',
          clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
        }}
      />
    </div>
  );
}

function useIsTouch(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);
}
