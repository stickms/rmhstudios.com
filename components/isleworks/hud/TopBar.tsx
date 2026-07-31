'use client';

/**
 * Isleworks — the status bar.
 *
 * Six numbers, chosen because each one, on its own, tells the player what to
 * build next: treasury (can I afford anything), population (is the city
 * growing), happiness (will it keep growing), jobs (is there work), power and
 * water (is anything about to stop). Everything else lives one click away in the
 * rail — a status bar you have to read is a status bar nobody reads.
 *
 * The month ring is the only element that animates continuously, and it
 * subscribes to its own store so the other five numbers are not re-rendered ten
 * times a second to draw it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Coins,
  Droplets,
  Gauge,
  Layers,
  Pause,
  RotateCcw,
  RotateCw,
  Smile,
  Users,
  ZoomIn,
  ZoomOut,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useIsleworks, useIsleworksClock, type OverlayMode } from '@/lib/isleworks/store';
import type { GameSpeed } from '@/lib/isleworks/types';
import type { RigHandle } from '../scene/CameraRig';

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

const SPEEDS: GameSpeed[] = [0, 1, 2, 3];

export function TopBar({ rigRef }: { rigRef: React.MutableRefObject<RigHandle | null> }) {
  const { t } = useTranslation('c-isleworks');
  const city = useIsleworks((s) => s.city);
  const speed = useIsleworks((s) => s.speed);
  const setSpeed = useIsleworks((s) => s.setSpeed);
  const overlay = useIsleworks((s) => s.overlay);
  const setOverlay = useIsleworks((s) => s.setOverlay);

  const stats = city.stats;
  const powerShort = stats.powerDemand > stats.powerSupply;
  const waterShort = stats.waterDemand > stats.waterSupply;

  return (
    <div className="isw-top">
      <div className="isw-panel isw-stats">
        <Treasury money={city.money} month={city.month} net={stats.netIncome} />

        <Stat
          icon={<Users size={14} aria-hidden />}
          label={t('stat-population', { defaultValue: 'Residents' })}
          value={compact(stats.population)}
        />
        <Stat
          icon={<Smile size={14} aria-hidden />}
          label={t('stat-happiness', { defaultValue: 'Happiness' })}
          value={`${Math.round(stats.happiness)}%`}
          tone={stats.happiness >= 62 ? 'good' : stats.happiness >= 42 ? undefined : 'bad'}
        />
        <Stat
          icon={<Gauge size={14} aria-hidden />}
          label={t('stat-jobs', { defaultValue: 'Jobs' })}
          value={`${compact(stats.jobsFilled)}/${compact(stats.jobs)}`}
        />
        <Stat
          icon={<Zap size={14} aria-hidden />}
          label={t('stat-power', { defaultValue: 'Power' })}
          value={`${compact(stats.powerSupply - stats.powerDemand)}`}
          tone={powerShort ? 'bad' : 'good'}
        />
        <Stat
          icon={<Droplets size={14} aria-hidden />}
          label={t('stat-water', { defaultValue: 'Water' })}
          value={`${compact(stats.waterSupply - stats.waterDemand)}`}
          tone={waterShort ? 'bad' : 'good'}
        />
      </div>

      <div className="isw-panel isw-clock">
        <MonthDial month={city.month} />
        <div className="isw-stat-body">
          <span className="isw-stat-value">
            {t('month-n', { defaultValue: 'Month {{n}}', n: city.month })}
          </span>
          <span className="isw-stat-label">
            {speed === 0
              ? t('paused', { defaultValue: 'Paused' })
              : t('speed-n', { defaultValue: '{{n}}× speed', n: speed })}
          </span>
        </div>
      </div>

      <div
        className="isw-panel isw-cluster"
        role="group"
        aria-label={t('speed', { defaultValue: 'Speed' })}
      >
        {SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            className="isw-btn"
            aria-pressed={speed === option}
            aria-label={
              option === 0
                ? t('pause', { defaultValue: 'Pause' })
                : t('speed-n', { defaultValue: '{{n}}× speed', n: option })
            }
            onClick={() => setSpeed(option)}
          >
            {option === 0 ? <Pause size={14} aria-hidden /> : <>{option}×</>}
          </button>
        ))}
      </div>

      <OverlayPicker value={overlay} onChange={setOverlay} />

      <div
        className="isw-panel isw-cluster"
        role="group"
        aria-label={t('camera', { defaultValue: 'Camera' })}
      >
        <button
          type="button"
          className="isw-btn"
          aria-label={t('rotate-left', { defaultValue: 'Rotate left' })}
          onClick={() => rigRef.current?.rotate(1)}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="isw-btn"
          aria-label={t('rotate-right', { defaultValue: 'Rotate right' })}
          onClick={() => rigRef.current?.rotate(-1)}
        >
          <RotateCw size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="isw-btn"
          aria-label={t('zoom-in', { defaultValue: 'Zoom in' })}
          onClick={() => rigRef.current?.zoomBy(1.25)}
        >
          <ZoomIn size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="isw-btn"
          aria-label={t('zoom-out', { defaultValue: 'Zoom out' })}
          onClick={() => rigRef.current?.zoomBy(0.8)}
        >
          <ZoomOut size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'cash';
}) {
  return (
    <div className={`isw-stat${tone ? ` isw-stat--${tone}` : ''}`}>
      <span className="isw-stat-icon">{icon}</span>
      <span className="isw-stat-body">
        <span className="isw-stat-value">{value}</span>
        <span className="isw-stat-label">{label}</span>
      </span>
    </div>
  );
}

/**
 * The treasury, with the month's result flying out of it.
 *
 * The pop is keyed on the month rather than on the balance: a player who spends
 * money should not see a "−240" chip for a building they deliberately bought,
 * only for what the city earned or cost them while they were not looking.
 */
function Treasury({ money, month, net }: { money: number; month: number; net: number }) {
  const { t } = useTranslation('c-isleworks');
  const [pop, setPop] = useState<{ id: number; amount: number } | null>(null);
  const lastMonth = useRef(month);
  const popId = useRef(0);

  useEffect(() => {
    if (month === lastMonth.current) return;
    lastMonth.current = month;
    if (Math.abs(net) < 1) return;
    const id = ++popId.current;
    setPop({ id, amount: net });
    const timer = window.setTimeout(() => {
      setPop((current) => (current?.id === id ? null : current));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [month, net]);

  return (
    <div className="isw-stat isw-stat--cash" style={{ position: 'relative' }}>
      <span className="isw-stat-icon">
        <Coins size={14} aria-hidden />
      </span>
      <span className="isw-stat-body">
        <span className="isw-stat-value">{compact(money)}</span>
        <span className="isw-stat-label">{t('stat-treasury', { defaultValue: 'Treasury' })}</span>
      </span>
      {pop && (
        <span
          className="isw-cash-pop"
          style={{ color: pop.amount >= 0 ? 'var(--isw-good)' : 'var(--isw-bad)' }}
        >
          {pop.amount >= 0 ? '+' : '−'}
          {compact(Math.abs(pop.amount))}
        </span>
      )}
    </div>
  );
}

/** The only thing in the HUD that redraws at 10 Hz. */
function MonthDial({ month }: { month: number }) {
  const progress = useIsleworksClock((s) => s.progress);
  const angle = Math.round(progress * 360);
  return (
    <span
      className="isw-clock-dial"
      style={{
        background: `conic-gradient(var(--isw-cool) ${angle}deg, rgb(255 255 255 / 14%) ${angle}deg)`,
      }}
      aria-hidden
    >
      <span style={{ fontSize: 10, fontWeight: 700 }}>{((month - 1) % 12) + 1}</span>
    </span>
  );
}

const OVERLAYS: { id: OverlayMode; labelKey: string; fallback: string }[] = [
  { id: 'none', labelKey: 'overlay-none', fallback: 'Normal' },
  { id: 'power', labelKey: 'overlay-power', fallback: 'Power' },
  { id: 'water', labelKey: 'overlay-water', fallback: 'Water' },
  { id: 'pollution', labelKey: 'overlay-pollution', fallback: 'Pollution' },
  { id: 'land-value', labelKey: 'overlay-land-value', fallback: 'Land value' },
  { id: 'traffic', labelKey: 'overlay-traffic', fallback: 'Traffic' },
];

function OverlayPicker({
  value,
  onChange,
}: {
  value: OverlayMode;
  onChange: (mode: OverlayMode) => void;
}) {
  const { t } = useTranslation('c-isleworks');
  const [open, setOpen] = useState(false);
  const active = OVERLAYS.find((o) => o.id === value) ?? OVERLAYS[0];

  return (
    <div className="isw-panel isw-cluster" style={{ flexWrap: 'wrap' }}>
      <button
        type="button"
        className={`isw-btn${value !== 'none' ? ' is-active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={14} aria-hidden />
        {t(active.labelKey, { defaultValue: active.fallback })}
      </button>
      {open &&
        OVERLAYS.filter((o) => o.id !== value).map((option) => (
          <button
            key={option.id}
            type="button"
            className="isw-btn"
            onClick={() => {
              onChange(option.id);
              setOpen(false);
            }}
          >
            {t(option.labelKey, { defaultValue: option.fallback })}
          </button>
        ))}
    </div>
  );
}
