'use client';

/**
 * A row of Windows Vista Sidebar gadgets: an analog clock, a dual-dial meter
 * (the old CPU Meter, reading your marathon instead), an Arrakis weather
 * report, and a tear-off countdown calendar.
 *
 * They react to the plan: the meter's needles spring to new values when you
 * tick something off, the calendar pages turn when you tear them. The clock is
 * a one-second interval writing two rotations — no frame loop.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { Sun, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { daysBetween, formatMinutes } from '@/lib/dunesday/schedule';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { sfx } from './sound';

function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function Clock() {
  const { t } = useTranslation('c-dunesday');
  const now = useNow();
  const h = now ? (now.getHours() % 12) * 30 + now.getMinutes() * 0.5 : 0;
  const m = now ? now.getMinutes() * 6 + now.getSeconds() * 0.1 : 0;
  const s = now ? now.getSeconds() * 6 : 0;
  return (
    <div className="ds-gadget ds-gadget--clock">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={now ? now.toLocaleTimeString() : t('clock', { defaultValue: 'Clock' })}
      >
        <defs>
          <radialGradient id="ds-clock-face" cx="50%" cy="35%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.7" stopColor="#e3f3ff" />
            <stop offset="1" stopColor="#9ccdf0" />
          </radialGradient>
          <linearGradient id="ds-clock-rim" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#5fc8ff" />
            <stop offset="1" stopColor="#0a5ea8" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="57" fill="url(#ds-clock-rim)" />
        <circle cx="60" cy="60" r="51" fill="url(#ds-clock-face)" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="58.5"
            y="12"
            width="3"
            height={i % 3 === 0 ? 9 : 5}
            rx="1.5"
            fill="#28507a"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
        <text x="60" y="80" textAnchor="middle" fontSize="8" fontWeight="700" fill="#2a6aa8">
          DUNESDAY
        </text>
        <rect
          x="57.5"
          y="32"
          width="5"
          height="30"
          rx="2.5"
          fill="#0b2a4a"
          transform={`rotate(${h} 60 60)`}
        />
        <rect
          x="58.5"
          y="20"
          width="3"
          height="42"
          rx="1.5"
          fill="#1b4b7a"
          transform={`rotate(${m} 60 60)`}
        />
        <rect
          x="59.4"
          y="16"
          width="1.2"
          height="52"
          fill="#e3462f"
          transform={`rotate(${s} 60 60)`}
        />
        <circle cx="60" cy="60" r="4" fill="#e3462f" />
        <ellipse cx="60" cy="36" rx="38" ry="20" fill="#ffffff" opacity="0.35" />
      </svg>
    </div>
  );
}

function Dial({ value, label, sub }: { value: number; label: string; sub: string }) {
  // -120° … +120° sweep, like the Vista meter.
  const angle = -120 + Math.max(0, Math.min(1, value)) * 240;
  return (
    <div className="ds-dial">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="ds-dial-face" cx="50%" cy="40%" r="65%">
            <stop offset="0" stopColor="#3d4d5e" />
            <stop offset="1" stopColor="#0d141c" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#ds-dial-face)" stroke="#9fb3c6" strokeWidth="3" />
        {Array.from({ length: 11 }, (_, i) => (
          <rect
            key={i}
            x="49.2"
            y="9"
            width="1.6"
            height={i % 5 === 0 ? 8 : 5}
            fill={i > 8 ? '#ff6b5a' : '#cfe6ff'}
            transform={`rotate(${-120 + i * 24} 50 50)`}
          />
        ))}
        <motion.g
          initial={false}
          animate={{ rotate: angle }}
          transition={{ type: 'spring', stiffness: 60, damping: 9 }}
        >
          {/* An invisible disc the size of the dial makes the group's box
              centred on the hub, so the rotation pivots there. */}
          <circle cx="50" cy="50" r="46" fill="transparent" />
          <path d="M49 52 L50 14 L51 52 Z" fill="#ff4b3a" />
        </motion.g>
        <circle cx="50" cy="50" r="5" fill="#cfd8e0" />
        <ellipse cx="50" cy="30" rx="32" ry="16" fill="#ffffff" opacity="0.12" />
      </svg>
      <div className="ds-dial-read">
        <strong>{label}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/** The Arrakis forecast — always hot, with a worm-sign level that changes daily. */
export function Weather({ today }: { today: string }) {
  const { t } = useTranslation('c-dunesday');
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const levels = [
    t('worm-low', { defaultValue: 'Low' }),
    t('worm-moderate', { defaultValue: 'Moderate' }),
    t('worm-high', { defaultValue: 'High' }),
    t('worm-shai-hulud', { defaultValue: 'Shai-Hulud' }),
  ];
  const temp = 52 + (seed % 9);
  return (
    <div className="ds-gadget ds-gadget--weather">
      <div className="ds-weather-top">
        <Sun size={34} aria-hidden="true" className="ds-weather-sun" />
        <div>
          <div className="ds-weather-temp">{temp}°C</div>
          <div className="ds-weather-place">{t('arrakis', { defaultValue: 'Arrakis' })}</div>
        </div>
      </div>
      <div className="ds-weather-row">
        <Wind size={13} aria-hidden="true" />
        {t('worm-sign', {
          defaultValue: 'Worm sign: {{level}}',
          level: levels[seed % levels.length],
        })}
      </div>
      <div className="ds-weather-row">{t('spice', { defaultValue: 'Spice: flowing' })}</div>
    </div>
  );
}

export function TearOff({ today }: { today: string }) {
  const { t } = useTranslation('c-dunesday');
  const left = Math.max(0, daysBetween(today, DUNESDAY));
  const [torn, setTorn] = useState(0);
  return (
    <button
      type="button"
      className="ds-gadget ds-gadget--cal"
      data-sfx="custom"
      onClick={() => {
        sfx.swoosh();
        setTorn((n) => n + 1);
      }}
      aria-label={t('cal-gadget', { defaultValue: '{{count}} days until Dunesday', count: left })}
    >
      <span className="ds-cal-rings" aria-hidden="true" />
      <AnimatePresence initial={false}>
        <motion.span
          key={torn}
          className="ds-cal-page"
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ y: 60, rotate: 18, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="ds-cal-num">{left}</span>
          <span className="ds-cal-label">
            {t('cal-days-to-go', { defaultValue: 'days to go' })}
          </span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function MeterGadget({
  pct,
  tonightMinutes,
  tonightBudget,
}: {
  pct: number;
  tonightMinutes: number;
  tonightBudget: number;
}) {
  const { t } = useTranslation('c-dunesday');
  const load = tonightBudget > 0 ? tonightMinutes / tonightBudget : 0;
  return (
    <div className="ds-gadget ds-gadget--meter">
      <Dial
        value={pct / 100}
        label={`${pct}%`}
        sub={t('dial-watched', { defaultValue: 'watched' })}
      />
      <Dial
        value={Math.min(1, load)}
        label={formatMinutes(tonightMinutes)}
        sub={t('dial-tonight', { defaultValue: 'tonight' })}
      />
    </div>
  );
}
