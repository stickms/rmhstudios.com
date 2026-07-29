/**
 * The temple's dialogs, toasts and prompts.
 *
 * All real DOM with real roles: `alertdialog` for the ones that appear on
 * their own, focus moved in and restored out, Escape to dismiss where
 * dismissing is safe. The 3D versions were meshes — no focus, no Escape, no
 * announcement, and no way to read them with a screen reader.
 *
 * Nothing here uses `window.alert`/`confirm`. Those ignore the theme, ignore
 * the locale, and block the tick loop.
 */
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import { computeBlissShards } from '@/lib/temple-of-joy/engine';
import { EVENT_MAP } from '@/lib/temple-of-joy/data/events';
import { ACHIEVEMENT_MAP } from '@/lib/temple-of-joy/data/achievements';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { TempleButton, Glyph } from './ui';

const store = () => useTempleStore.getState();

/* ─── Dialog shell ──────────────────────────────────────────────────────── */

interface DialogProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** Escape and backdrop clicks dismiss. Omit for a choice that must be made. */
  onDismiss?: () => void;
}

function Dialog({ title, children, actions, onDismiss }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    // Focus the panel, not the first button: a modal that opens with "Confirm"
    // focused is one stray Enter away from an irreversible reset.
    panelRef.current?.focus();
    return () => restoreTo.current?.focus?.();
  }, []);

  /** Keep Tab inside the dialog while it is open. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && onDismiss) {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onDismiss],
  );

  return (
    <div
      className="toj-scrim"
      onPointerDown={(event) => {
        if (onDismiss && event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        className="toj-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="toj-dialog-body">
          <h2 className="toj-dialog-title">{title}</h2>
          {children}
        </div>
        <div className="toj-dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

/* ─── Events ────────────────────────────────────────────────────────────── */

function EventDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const show = useTempleValue((s) => s.showEventModal);
  const pending = useTempleValue((s) => s.pendingEvent);

  if (!show || !pending) return null;
  const event = EVENT_MAP[pending];
  if (!event) return null;

  const choices =
    event.type === 'blessing'
      ? [{ label: t('accept-the-gift', { defaultValue: 'Accept the gift' }) }]
      : (event.choices ?? []);

  const resolve = (index: number) => {
    store().resolveEvent(pending, index);
    store().setShowEventModal(false);
  };

  return (
    <Dialog
      title={event.title}
      actions={choices.map((choice, index) => (
        <TempleButton
          key={choice.label}
          variant={index === 0 ? 'gold' : 'stone'}
          onClick={() => resolve(index)}
        >
          {choice.label}
        </TempleButton>
      ))}
    >
      <p className="toj-dialog-text">{event.body}</p>
    </Dialog>
  );
}

/* ─── Transcendence ─────────────────────────────────────────────────────── */

function TranscendenceDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const show = useTempleValue((s) => s.showTranscendenceModal);
  const shards = useTempleSnapshot(
    (s) => (s.showTranscendenceModal ? computeBlissShards(s) : 0),
    500,
  );
  const format = useTempleValue((s) => s.numberFormat);

  if (!show) return null;

  return (
    <Dialog
      title={t('transcend', { defaultValue: 'Transcend' })}
      onDismiss={() => store().setShowTranscendenceModal(false)}
      actions={
        <>
          <TempleButton variant="quiet" onClick={() => store().setShowTranscendenceModal(false)}>
            {t('cancel', { defaultValue: 'Not yet' })}
          </TempleButton>
          <TempleButton
            variant="gold"
            onClick={() => {
              store().transcend();
              store().setShowTranscendenceModal(false);
            }}
          >
            {t('confirm-transcend', { defaultValue: 'Let it all go' })}
          </TempleButton>
        </>
      }
    >
      <p className="toj-dialog-text">
        {t('transcend-warning', {
          defaultValue:
            'Everything in this run — your joy, your sources, your upgrades — returns to the wheel. What you keep is permanent.',
        })}
      </p>
      <p className="toj-dialog-figure">
        <Glyph>💎</Glyph> +{fmt(shards, format)}
      </p>
      <p className="toj-dialog-text">{t('bliss-shards', { defaultValue: 'Bliss Shards' })}</p>
    </Dialog>
  );
}

/* ─── Welcome back ──────────────────────────────────────────────────────── */

function OfflineDialog() {
  const { t } = useTranslation('c-temple-of-joy');
  const show = useTempleValue((s) => s.showOfflineModal);
  const seconds = useTempleValue((s) => s.offlineSecondsOnLoad);
  const happiness = useTempleValue((s) => s.offlineHappinessOnLoad);
  const format = useTempleValue((s) => s.numberFormat);

  if (!show || seconds <= 0) return null;

  return (
    <Dialog
      title={t('welcome-back', { defaultValue: 'Welcome back' })}
      onDismiss={() => store().setShowOfflineModal(false)}
      actions={
        <TempleButton variant="gold" onClick={() => store().setShowOfflineModal(false)}>
          {t('collect', { defaultValue: 'Collect' })}
        </TempleButton>
      }
    >
      <p className="toj-dialog-text">
        {t('you-were-away-for', { defaultValue: 'The temple kept burning for' })}{' '}
        {formatDuration(seconds)}
      </p>
      <p className="toj-dialog-figure">+{fmt(happiness, format)}</p>
    </Dialog>
  );
}

/* ─── Vibe check ────────────────────────────────────────────────────────── */

/** How long the prompt stays up before it fades unclaimed. */
const VIBE_WINDOW_S = 10;

function VibeCheck() {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useTempleSnapshot(
    (s) => ({
      due: s.vibeCheckTimer <= 0,
      hasBuff: s.vibeBuff !== null,
      eventOpen: s.showEventModal,
      // Once the timer resets above the window, a new cycle has begun.
      fresh: s.vibeCheckTimer > VIBE_WINDOW_S,
    }),
    400,
  );

  const [remaining, setRemaining] = useState<number | null>(null);
  const dismissed = useRef(false);

  const shouldOffer = snap.due && !snap.hasBuff && !snap.eventOpen && !dismissed.current;

  useEffect(() => {
    if (snap.fresh) dismissed.current = false;
  }, [snap.fresh]);

  useEffect(() => {
    if (!shouldOffer) {
      setRemaining(null);
      return;
    }
    setRemaining(VIBE_WINDOW_S);
    const id = window.setInterval(() => {
      setRemaining((current) => {
        if (current === null) return null;
        if (current <= 1) {
          dismissed.current = true;
          window.clearInterval(id);
          return null;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [shouldOffer]);

  if (remaining === null) return null;

  return (
    <div className="toj-vibe">
      <TempleButton
        variant="gold"
        ready
        onClick={() => {
          store().passVibeCheck();
          dismissed.current = true;
          setRemaining(null);
        }}
      >
        <Glyph>✨</Glyph>
        {t('vibe-check-timed', {
          seconds: remaining,
          defaultValue: 'Vibe check! ({{seconds}})',
        })}
      </TempleButton>
    </div>
  );
}

/* ─── Achievement toasts ────────────────────────────────────────────────── */

interface Trophy {
  key: number;
  name: string;
}

/** Beyond three at once the corner is a wall of text nobody reads. */
const MAX_TOASTS = 3;
const TOAST_MS = 4500;

function AchievementToasts() {
  const { t } = useTranslation('c-temple-of-joy');
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const counter = useRef(0);

  const snap = useTempleSnapshot(
    (s) => ({ ids: [...s.achievements].join(','), ready: s.gameInitialized }),
    700,
  );

  useEffect(() => {
    if (!snap.ready) return;
    const ids = snap.ids.split(',').filter(Boolean);

    // The first sample after load is the baseline — a returning player should
    // not be handed four hundred toasts for achievements they earned last week.
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }

    const fresh = ids.filter((id) => !seen.current!.has(id));
    seen.current = new Set(ids);
    if (fresh.length === 0) return;

    templeAudio.playAchievement();
    setTrophies((current) =>
      [
        ...current,
        ...fresh.map((id) => ({ key: ++counter.current, name: ACHIEVEMENT_MAP[id]?.name ?? id })),
      ].slice(-MAX_TOASTS),
    );
  }, [snap.ids, snap.ready]);

  // One sweep rather than a timer per toast.
  useEffect(() => {
    if (trophies.length === 0) return;
    const id = window.setTimeout(() => setTrophies((current) => current.slice(1)), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [trophies]);

  if (trophies.length === 0) return null;

  return (
    <div className="toj-toasts" role="status" aria-live="polite">
      {trophies.map((trophy) => (
        <div className="toj-toast" key={trophy.key}>
          <Glyph>🏆</Glyph>
          <span>
            <span className="toj-toast-label">
              {t('achievement-unlocked', { defaultValue: 'Trophy' })}
            </span>
            <br />
            <span className="toj-toast-name">{trophy.name}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Everything at once ────────────────────────────────────────────────── */

export function TempleDialogs() {
  return (
    <>
      {/* Order matters: only one scrim should ever be up, and an event that
          fires while a confirm is open must not stack on top of it. */}
      <EventDialog />
      <TranscendenceDialog />
      <OfflineDialog />
      <VibeCheck />
      <AchievementToasts />
    </>
  );
}
