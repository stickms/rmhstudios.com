'use client';

/**
 * Dunesday Media Player — tonight's lineup, Windows Media Player 12 style.
 *
 * It doesn't stream anything (you watch on whatever you own); it is the remote
 * you keep open beside it. The playlist is the next scheduled day. Play starts
 * a watch timer against the entry's runtime, and "Watched" ticks it off — a
 * series entry marks its episode range, a film marks the film — and moves on.
 */

import { Check, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanEntry } from '@/lib/dunesday/schedule';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { isWatched, titleById } from '@/lib/dunesday/state';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { fmtDay, LONG } from '../../format';
import { useEntryLabel } from '../../Schedule';
import { sfx } from '../../sound';
import { openApp } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function PlayerApp(_: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, actions, plan, today, muted, toggleMuted } = useDunesday();
  const label = useEntryLabel(state);
  const day = useMemo(
    () => plan.days.find((d) => d.date >= today && d.entries.length) ?? null,
    [plan, today],
  );
  const entries: PlanEntry[] = day?.entries ?? [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const entry = entries[Math.min(index, Math.max(0, entries.length - 1))];
  const title = entry ? titleById(state, entry.titleId) : undefined;
  const total = (entry?.minutes ?? 0) * 60;

  // The plan re-flows when something is ticked off; keep the cursor in range.
  useEffect(() => {
    if (index >= entries.length) setIndex(0);
  }, [entries.length, index]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setElapsed((e) => Math.min(e + 1, total || e + 1)), 1000);
    return () => window.clearInterval(id);
  }, [playing, total]);

  const select = (i: number) => {
    setIndex(i);
    setElapsed(0);
    setPlaying(false);
    sfx.tick();
  };

  const markDone = () => {
    if (!entry || !title) return;
    if (entry.episodes && title.episodes) {
      actions.setEpisodes(title.id, entry.episodes[1], title.episodes);
    } else if (!entry.part || entry.part[0] === entry.part[1]) {
      if (!isWatched(state, title)) actions.toggleWatched(title.id);
    }
    sfx.chime();
    setElapsed(0);
    setPlaying(false);
    // A ticked-off entry leaves the plan, so the next one slides into this slot.
    if (entry.part && entry.part[0] < entry.part[1])
      setIndex((i) => Math.min(i + 1, entries.length - 1));
  };

  return (
    <div className={cn('ds-wmp', playing && 'ds-wmp--playing')}>
      <div className="ds-wmp-main">
        <div className="ds-wmp-stage">
          <div className="ds-wmp-viz" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${-i * 0.37}s` }} />
            ))}
          </div>
          {title ? (
            <div className="ds-wmp-now">
              <Icon name={title.kind === 'series' ? 'series' : 'film'} size={64} />
              <h2>{label(entry)}</h2>
              <p>{title.hook}</p>
              <p className="ds-wmp-meta">
                {title.released.startsWith('9999') ? '' : `${title.released.slice(0, 4)} · `}
                {formatMinutes(entry.minutes)}
              </p>
            </div>
          ) : (
            <div className="ds-wmp-now">
              <Icon name="player" size={64} />
              <h2>{t('wmp-empty', { defaultValue: 'Nothing scheduled' })}</h2>
              <p>
                {t('wmp-empty-text', {
                  defaultValue:
                    'Your watch list is done — or empty. Open the planner to add titles.',
                })}
              </p>
              <button type="button" className="ds-btn7" onClick={() => openApp('planner')}>
                {t('ie-open-planner', { defaultValue: 'Open the planner' })}
              </button>
            </div>
          )}
        </div>

        <aside className="ds-wmp-list" aria-label={t('wmp-playlist', { defaultValue: 'Playlist' })}>
          <header>
            <strong>{t('wmp-tonight', { defaultValue: 'Tonight' })}</strong>
            {day && (
              <span>
                {day.date === today
                  ? t('wmp-today', { defaultValue: 'Today' })
                  : fmtDay(day.date, i18n.language, LONG)}{' '}
                · {formatMinutes(day.minutes)}
              </span>
            )}
          </header>
          <ol>
            {entries.map((e, i) => (
              <li key={`${e.titleId}-${i}`}>
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  className={cn(i === index && 'ds-wmp-on')}
                  onClick={() => select(i)}
                >
                  <span className="ds-wmp-n">{i + 1}</span>
                  <span className="ds-wmp-t">{label(e)}</span>
                  <span className="ds-wmp-d">{formatMinutes(e.minutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div className="ds-wmp-seek">
        <span>{clock(elapsed)}</span>
        <span
          className="ds-wmp-track"
          role="progressbar"
          aria-label={t('wmp-progress', { defaultValue: 'Watch timer' })}
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={elapsed}
        >
          <span style={{ transform: `scaleX(${total ? elapsed / total : 0})` }} />
        </span>
        <span>{clock(total)}</span>
      </div>

      <div className="ds-wmp-controls">
        <button
          type="button"
          className="ds-wmp-btn ds-wmp-btn--done"
          disabled={!entry}
          onClick={markDone}
          aria-label={t('wmp-watched', { defaultValue: 'Mark as watched' })}
          title={t('wmp-watched', { defaultValue: 'Mark as watched' })}
        >
          <Check size={18} aria-hidden="true" />
        </button>
        <span className="ds-wmp-transport">
          <button
            type="button"
            className="ds-wmp-btn"
            disabled={index === 0}
            onClick={() => select(index - 1)}
            aria-label={t('wmp-prev', { defaultValue: 'Previous' })}
          >
            <SkipBack size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-wmp-play"
            disabled={!entry}
            onClick={() => {
              sfx.bloop();
              setPlaying((p) => !p);
            }}
            aria-label={
              playing
                ? t('wmp-pause', { defaultValue: 'Pause timer' })
                : t('wmp-play', { defaultValue: 'Start timer' })
            }
            aria-pressed={playing}
          >
            {playing ? (
              <Pause size={24} aria-hidden="true" />
            ) : (
              <Play size={24} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="ds-wmp-btn"
            disabled={index >= entries.length - 1}
            onClick={() => select(index + 1)}
            aria-label={t('wmp-next', { defaultValue: 'Next' })}
          >
            <SkipForward size={16} aria-hidden="true" />
          </button>
        </span>
        <button
          type="button"
          className="ds-wmp-btn"
          onClick={toggleMuted}
          aria-pressed={muted}
          aria-label={
            muted
              ? t('unmute', { defaultValue: 'Turn sounds on' })
              : t('mute', { defaultValue: 'Mute sounds' })
          }
        >
          {muted ? (
            <VolumeX size={16} aria-hidden="true" />
          ) : (
            <Volume2 size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
