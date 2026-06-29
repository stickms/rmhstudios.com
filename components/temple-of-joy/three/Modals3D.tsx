'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { computeBlissShards } from '@/lib/temple-of-joy/engine';
import { EVENT_MAP } from '@/lib/temple-of-joy/data/events';
import { ACHIEVEMENT_MAP } from '@/lib/temple-of-joy/data/achievements';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { Panel3D } from './ui3d/Panel3D';
import { Label3D } from './ui3d/Label3D';
import { Button3D } from './ui3d/Button3D';
import { useOverlaySize } from './ui3d/overlay';

const S = () => useTempleStore.getState();

function useSnap<T>(read: (s: ReturnType<typeof useTempleStore.getState>) => T, ms = 250): T {
  const [v, setV] = useState(() => read(useTempleStore.getState()));
  useEffect(() => {
    const id = window.setInterval(() => setV(read(useTempleStore.getState())), ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return v;
}

function Backdrop({ w, h }: { w: number; h: number }) {
  return (
    <mesh position={[0, 0, -0.4]} renderOrder={1}>
      <planeGeometry args={[w * 1.3, h * 1.3]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}

function CenterModal({ w, h, width, height, children }: { w: number; h: number; width: number; height: number; children: ReactNode }) {
  return (
    <>
      <Backdrop w={w} h={h} />
      <Panel3D width={width} height={height} billboard={false} position={[0, 0, 0]}>
        {children}
      </Panel3D>
    </>
  );
}

/** Event blessing/choice popup. */
function EventModal3D({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useSnap((s) => ({ pendingEvent: s.pendingEvent, show: s.showEventModal }), 200);
  if (!snap.pendingEvent || !snap.show) return null;
  const event = EVENT_MAP[snap.pendingEvent];
  if (!event) return null;
  const choices = event.type === 'blessing' ? [{ label: t('accept-the-gift', { defaultValue: 'Accept the gift ✓' }) }] : (event.choices ?? []);
  const resolve = (i: number) => { S().resolveEvent(snap.pendingEvent!, i); S().setShowEventModal(false); };
  const top = 1.9;
  return (
    <CenterModal w={w} h={h} width={5} height={4}>
      <Label3D text={event.title} billboard={false} height={0.34} options={{ color: '#f0c84a', fontSize: 56, maxWidth: 760 }} position={[0, top - 0.3, 0.06]} />
      <Label3D text={event.body} billboard={false} height={1.1} options={{ color: '#e8d5b0', fontSize: 32, italic: true, maxWidth: 720 }} position={[0, 0.55, 0.06]} />
      {choices.map((c, i) => (
        <Button3D key={i} label={c.label} onClick={() => resolve(i)} width={4} height={0.5} fontSize={34} position={[0, -0.7 - i * 0.62, 0.1]} billboard={false} />
      ))}
    </CenterModal>
  );
}

/** Transcendence confirm. */
function TranscendenceModal3D({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useSnap((s) => ({ show: s.showTranscendenceModal, fmtMode: s.numberFormat }), 200);
  if (!snap.show) return null;
  const shards = computeBlissShards(S());
  return (
    <CenterModal w={w} h={h} width={4.6} height={3.2}>
      <Label3D text={`🌀 ${t('transcend', { defaultValue: 'Transcend' })}`} billboard={false} height={0.36} options={{ color: '#f0c84a', fontSize: 58 }} position={[0, 1.1, 0.06]} />
      <Label3D text={t('transcend-warning', { defaultValue: 'Reset this run for permanent power.' })} billboard={false} height={0.6} options={{ color: '#e8d5b0', fontSize: 30, italic: true, maxWidth: 660 }} position={[0, 0.4, 0.06]} />
      <Label3D text={`+${fmt(shards, snap.fmtMode)} 💎 ${t('bliss-shards', { defaultValue: 'Bliss Shards' })}`} billboard={false} height={0.24} options={{ color: '#ffd27a', fontSize: 40 }} position={[0, -0.25, 0.06]} />
      <Button3D label={t('confirm-transcend', { defaultValue: 'Transcend' })} onClick={() => { S().transcend(); S().setShowTranscendenceModal(false); }} pulse width={2} height={0.5} fontSize={36} position={[-1.15, -1.05, 0.1]} billboard={false} />
      <Button3D label={t('cancel', { defaultValue: 'Cancel' })} onClick={() => S().setShowTranscendenceModal(false)} color="#6b4c2a" width={1.8} height={0.5} fontSize={36} position={[1.15, -1.05, 0.1]} billboard={false} />
    </CenterModal>
  );
}

/** Offline-earnings welcome back. */
function OfflineModal3D({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useSnap((s) => ({ show: s.showOfflineModal, secs: s.offlineSecondsOnLoad, hap: s.offlineHappinessOnLoad, fmtMode: s.numberFormat }), 250);
  if (!snap.show || snap.secs <= 0) return null;
  return (
    <CenterModal w={w} h={h} width={4.4} height={3}>
      <Label3D text={`🌙 ${t('welcome-back', { defaultValue: 'Welcome Back' })}`} billboard={false} height={0.34} options={{ color: '#f0c84a', fontSize: 56 }} position={[0, 0.95, 0.06]} />
      <Label3D text={`${t('you-were-away-for', { defaultValue: 'You were away for' })} ${formatDuration(snap.secs)}`} billboard={false} height={0.22} options={{ color: '#e8d5b0', fontSize: 34 }} position={[0, 0.3, 0.06]} />
      <Label3D text={`+${fmt(snap.hap, snap.fmtMode)} ✨`} billboard={false} height={0.3} options={{ color: '#ffd27a', fontSize: 48 }} position={[0, -0.3, 0.06]} />
      <Button3D label={t('collect', { defaultValue: 'Collect' })} onClick={() => S().setShowOfflineModal(false)} pulse width={2.2} height={0.5} fontSize={36} position={[0, -1, 0.1]} billboard={false} />
    </CenterModal>
  );
}

/** Vibe-check prompt (bottom-right, 10s window). */
function VibeCheck3D({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useSnap((s) => ({ timer: s.vibeCheckTimer, buff: s.vibeBuff, eventOpen: s.showEventModal }), 300);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(10);
  const [dismissed, setDismissed] = useState(false);
  const prev = useRef(false);

  const shouldShow = snap.timer <= 0 && !snap.buff && !snap.eventOpen && !dismissed;
  useEffect(() => {
    if (shouldShow && !prev.current) { setVisible(true); setCount(10); }
    prev.current = shouldShow;
  }, [shouldShow]);
  useEffect(() => {
    if (!visible) return;
    if (count <= 0) { setVisible(false); setDismissed(true); return; }
    const id = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [visible, count]);
  // Reset dismissed once a new cycle begins (timer back above 0 via buff/reset).
  useEffect(() => { if (snap.timer > 5) setDismissed(false); }, [snap.timer]);

  if (!visible) return null;
  return (
    <Button3D
      label={`✨ ${t('vibe-check', { defaultValue: 'Vibe Check!' })} (${count})`}
      onClick={() => { S().passVibeCheck(); setVisible(false); setDismissed(true); }}
      pulse
      width={2.6}
      height={0.6}
      fontSize={36}
      position={[w / 2 - 1.6, -h / 2 + 1.4, 0]}
      billboard={false}
    />
  );
}

/** Newly-earned achievement toasts (top-right, auto-dismiss). */
function AchievementToast3D({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const [toasts, setToasts] = useState<{ id: number; name: string }[]>([]);
  const prev = useRef<Set<string> | null>(null);
  const counter = useRef(0);
  const snap = useSnap((s) => ({ ach: s.achievements, init: s.gameInitialized }), 500);

  useEffect(() => {
    if (!snap.init) return;
    if (prev.current === null) { prev.current = new Set(snap.ach); return; }
    const fresh = [...snap.ach].filter((id) => !prev.current!.has(id));
    prev.current = new Set(snap.ach);
    if (!fresh.length) return;
    templeAudio.playAchievement();
    const added = fresh.map((id) => ({ id: ++counter.current, name: ACHIEVEMENT_MAP[id]?.name ?? id }));
    setToasts((p) => [...p, ...added]);
    added.forEach((a) => window.setTimeout(() => setToasts((p) => p.filter((x) => x.id !== a.id)), 4500));
  }, [snap.ach, snap.init]);

  return (
    <>
      {toasts.slice(0, 3).map((toast, i) => (
        <group key={toast.id} position={[w / 2 - 2, h / 2 - 1.6 - i * 0.8, 0]}>
          <Panel3D width={3.4} height={0.7} billboard={false} accent="#f0c84a">
            <Label3D text={`🏆 ${t('achievement-unlocked', { defaultValue: 'Achievement!' })}`} billboard={false} height={0.16} options={{ color: '#f0c84a', fontSize: 28, align: 'left' }} anchorX="left" position={[-1.55, 0.16, 0.06]} />
            <Label3D text={toast.name} billboard={false} height={0.18} options={{ color: '#e8d5b0', fontSize: 30, align: 'left', maxWidth: 600 }} anchorX="left" position={[-1.55, -0.12, 0.06]} />
          </Panel3D>
        </group>
      ))}
    </>
  );
}

/**
 * All transient popups (events, transcendence, offline, vibe check, achievement
 * toasts) rendered as real 3D panels in the <Hud> layer — the last of the UI to
 * leave the DOM. Centred modals dim the scene behind them.
 */
export function Modals3D() {
  const { w, h } = useOverlaySize();
  return (
    <>
      <EventModal3D w={w} h={h} />
      <TranscendenceModal3D w={w} h={h} />
      <OfflineModal3D w={w} h={h} />
      <VibeCheck3D w={w} h={h} />
      <AchievementToast3D w={w} h={h} />
    </>
  );
}
