'use client';

/**
 * The opening screen: the wordmark, a live countdown to 18 December in glossy
 * bubbles, and the two films everything is counting down to.
 */

import { m as motion } from 'framer-motion';
import { ChevronDown, Shield, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DURATION, EASE } from '@/lib/motion';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { fmtDay, LONG } from './format';

function useCountdown(target: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (now === null) return null;
  const [y, mo, d] = target.split('-').map(Number);
  const ms = Math.max(0, new Date(y, mo - 1, d).getTime() - now);
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor(ms / 3_600_000) % 24,
    minutes: Math.floor(ms / 60_000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
    over: ms === 0,
  };
}

export function Hero() {
  const { t, i18n } = useTranslation('c-dunesday');
  const left = useCountdown(DUNESDAY);
  const units = [
    { key: 'd', value: left?.days, label: t('count-days', { defaultValue: 'Days' }) },
    { key: 'h', value: left?.hours, label: t('count-hours', { defaultValue: 'Hours' }) },
    { key: 'm', value: left?.minutes, label: t('count-minutes', { defaultValue: 'Min' }) },
    { key: 's', value: left?.seconds, label: t('count-seconds', { defaultValue: 'Sec' }) },
  ];

  return (
    <header className="ds-hero">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE.standard }}
      >
        <span className="ds-kicker">
          <Sparkles size={14} aria-hidden="true" />
          {t('kicker', {
            defaultValue: 'The MCU + Dune marathon planner · {{date}}',
            date: fmtDay(DUNESDAY, i18n.language, LONG),
          })}
        </span>
      </motion.div>

      <motion.h1
        className="ds-wordmark"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE.emphasized }}
      >
        DUNES<span className="ds-wordmark-sand">DAY</span>
      </motion.h1>
      <div className="ds-reflection" aria-hidden="true">
        DUNESDAY
      </div>

      <p className="ds-tagline">
        {t('tagline', {
          defaultValue:
            'Avengers: Doomsday and Dune: Part Three open the same day. Pick your start date and your pace, and get a night-by-night plan that finishes every film and show before the lights go down.',
        })}
      </p>

      <div className="ds-countdown" role="timer" aria-live="off">
        {left?.over ? (
          <div className="ds-kicker">
            {t('its-dunesday', { defaultValue: 'It’s Dunesday. Enjoy the show!' })}
          </div>
        ) : (
          units.map((u, i) => (
            <motion.div
              key={u.key}
              className="ds-count-bubble"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: EASE.emphasized }}
            >
              <span className="ds-count-value">{u.value ?? '—'}</span>
              <span className="ds-count-label">{u.label}</span>
            </motion.div>
          ))
        )}
      </div>

      <div className="ds-finales">
        <div className="ds-card ds-finale">
          <span className="ds-finale-icon ds-finale-icon--mcu">
            <Shield size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Avengers: Doomsday</strong>
            <div className="ds-hint">
              {t('finale-mcu', {
                defaultValue: 'The MCU’s next team-up. Every film and series counts.',
              })}
            </div>
          </div>
        </div>
        <div className="ds-card ds-finale">
          <span className="ds-finale-icon ds-finale-icon--dune">
            <Sun size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Dune: Part Three</strong>
            <div className="ds-hint">
              {t('finale-dune', { defaultValue: 'Paul’s story continues. Two films to rewatch.' })}
            </div>
          </div>
        </div>
      </div>

      <a href="#plan" className="ds-scroll-cue">
        {t('build-cta', { defaultValue: 'Build my marathon' })}
        <ChevronDown size={20} aria-hidden="true" />
      </a>
    </header>
  );
}
