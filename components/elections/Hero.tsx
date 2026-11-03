import { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Share2 } from 'lucide-react';
import { countdownTo, type Cycle, type Phase } from '@/lib/elections/calendar';
import { useNow } from './hooks';
import { BriefingPortrait, HOST_NAME } from './BriefingPortrait';

const pad = (n: number) => String(n).padStart(2, '0');

export function Hero({
  cycle,
  phase,
  serverTime,
  racesCalled,
  racesTotal,
  onShare,
}: {
  cycle: Cycle;
  phase: Phase;
  serverTime?: string;
  racesCalled: number;
  racesTotal: number;
  onShare: () => void;
}) {
  const { t } = useTranslation('c-elections');
  const ref = useRef<HTMLElement | null>(null);
  const now = useNow(1000, serverTime);
  const cd = now ? countdownTo(cycle.date, now) : null;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yDoodle = useTransform(scrollYProgress, [0, 1], [0, 90]);

  const kindWord =
    cycle.kind === 'midterm'
      ? t('hero.midterms', { defaultValue: 'Midterms' })
      : t('hero.president', { defaultValue: 'President' });

  // Counting down to the first polls CLOSING (6 p.m. Eastern), not to midnight: that is when results begin.
  const waiting = !!cd && cd.totalMs > 0 && (phase === 'upcoming' || phase === 'election-day');
  const live = !waiting && (phase === 'election-day' || phase === 'counting');

  return (
    <section ref={ref} className="el-hero" aria-labelledby="el-title">
      <div className="el-wrap el-hero__in">
        <div className="el-bento">
          <div className="el-cell el-cell--title" aria-hidden>
            <span>{`elections.exe — ${cycle.year}`}</span>
            <span className="el-win">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="el-cell el-cell--head">
            <p className="el-eyebrow" style={{ margin: 0 }}>
              <span className="el-chip el-chip--ink">{cycle.title}</span>{' '}
              <span className="el-chip">{cycle.date}</span>
            </p>
            <h1 id="el-title" className="el-hero__title">
              <span>{t('hero.vote', { defaultValue: 'Vote' })}</span>
              <span>
                {cycle.year} {kindWord}
              </span>
            </h1>
            <motion.svg className="el-doodle" viewBox="0 0 100 70" aria-hidden style={{ y: yDoodle }}>
              <path d="M6 50 C 22 8, 56 6, 88 30 M70 12 L90 31 L66 44" />
            </motion.svg>
            <p className="el-hero__sub">
              {waiting
                ? t('hero.subUpcoming', {
                    defaultValue: 'Live results, calls and your own map — the moment the first polls close.',
                  })
                : phase === 'archive'
                  ? t('hero.subArchive', { defaultValue: 'The final board. Every race, every margin.' })
                  : t('hero.subLive', {
                      defaultValue: '{{called}} of {{total}} races called. Updating every 20 seconds.',
                      called: racesCalled,
                      total: racesTotal,
                    })}
            </p>
            <div className="el-hero__ctas">
              <a className="el-btn el-btn--pink" href="#results">
                <ArrowDown size={18} aria-hidden />
                {live ? t('hero.ctaLive', { defaultValue: 'Live results' }) : t('hero.ctaResults', { defaultValue: 'The board' })}
              </a>
              <a className="el-btn" href="#predict">
                {t('hero.ctaPredict', { defaultValue: 'Paint your map' })}
              </a>
              <button type="button" className="el-btn el-btn--ghost" onClick={onShare}>
                <Share2 size={18} aria-hidden />
                {t('hero.share', { defaultValue: 'Share' })}
              </button>
              <Link className="el-btn el-btn--ghost" to="/predictions">
                {t('hero.markets', { defaultValue: 'Bet coins' })}
              </Link>
            </div>
          </div>

          <div className="el-cell el-cell--vert">
            <span className="el-glyph el-glyph--a" aria-hidden>
              ✱
            </span>
            <span className="el-vert" aria-hidden>
              {t('hero.vertical', { defaultValue: 'Election night' })}
            </span>
            <BriefingPortrait
              variant={4}
              className="el-hero__portrait"
              drift={34}
              caption={`${HOST_NAME} · ${t('portrait.role', { defaultValue: 'Briefing Room host' })}`}
            />
          </div>

          <div className="el-cell el-cell--count">
            {waiting ? (
              <>
                <p className="el-eyebrow" style={{ margin: 0 }}>
                  {t('hero.closeLabel', { defaultValue: 'First polls close in' })}
                </p>
                <div className="el-count" role="timer" aria-label={t('hero.countdownClose', { defaultValue: 'Time until the first polls close' })}>
                  {[
                    [cd?.days, t('hero.days', { defaultValue: 'days' })],
                    [cd?.hours, t('hero.hours', { defaultValue: 'hrs' })],
                    [cd?.minutes, t('hero.minutes', { defaultValue: 'min' })],
                    [cd?.seconds, t('hero.seconds', { defaultValue: 'sec' })],
                  ].map(([n, l]) => (
                    <div className="el-count__cell" key={String(l)}>
                      <span className="el-count__n">{n == null ? '--' : pad(Number(n))}</span>
                      <span className="el-count__l">{l}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="el-eyebrow" style={{ margin: 0 }}>
                  {live ? t('hero.nowLabel', { defaultValue: 'Right now' }) : t('hero.finalLabel', { defaultValue: 'Final' })}
                </p>
                <div style={{ marginTop: 14 }}>
                  {live ? <span className="el-live">{t('hero.live', { defaultValue: 'LIVE' })}</span> : null}
                </div>
              </>
            )}
          </div>

          <div className="el-cell el-cell--stat">
            <span className="el-stat__n">{racesTotal ? (live ? racesCalled : racesTotal) : '—'}</span>
            <span className="el-stat__l">
              {live
                ? t('hero.statCalled', { defaultValue: 'races called' })
                : t('hero.statTotal', { defaultValue: 'races on the ballot' })}
            </span>
          </div>

          <div className="el-cell el-cell--note">
            <p className="el-eyebrow">{t('hero.noteLabel', { defaultValue: 'How it works' })}</p>
            <p>
              {t('hero.noteBriefing', {
                defaultValue:
                  'Results come straight from the count, updated every 20 seconds. Calls, flips and closing polls appear as they happen — watch live, paint your own map, or open the Briefing Room.',
              })}
            </p>
          </div>
          <nav className="el-cell el-cell--tabs" aria-label={t('hero.sections', { defaultValue: 'Sections' })}>
            <div className="el-tabrow">
              <a href="#results">{t('nav.results', { defaultValue: 'Results' })}</a>
              <a href="#map">{t('nav.map', { defaultValue: 'Map' })}</a>
              <a href="#races">{t('nav.races', { defaultValue: 'Races' })}</a>
              <a href="#measures">{t('nav.measures', { defaultValue: 'Measures' })}</a>
              <a href="#offices">{t('nav.offices', { defaultValue: 'Local' })}</a>
              <a href="#polls">{t('nav.polls', { defaultValue: 'Polls' })}</a>
              <a href="#live">{t('nav.watch', { defaultValue: 'Watch' })}</a>
              <a href="#predict">{t('nav.predict', { defaultValue: 'Predict' })}</a>
            </div>
          </nav>
        </div>
      </div>
    </section>
  );
}
