import { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Share2 } from 'lucide-react';
import { countdownTo, type Cycle, type Phase } from '@/lib/elections/calendar';
import { useNow } from './hooks';

const pad = (n: number) => String(n).padStart(2, '0');

/** A pixel-art arrow, drawn on a 12×16 grid with crisp edges: the reference's cursor. */
function PixelCursor() {
  const rows = [
    '1...........',
    '11..........',
    '111.........',
    '1111........',
    '11111.......',
    '111111......',
    '1111111.....',
    '11111111....',
    '111111111...',
    '1111111111..',
    '11111111111.',
    '111111......',
    '11.111......',
    '1...111.....',
    '....111.....',
    '.....11.....',
  ];
  return (
    <svg viewBox="0 0 12 16" aria-hidden shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)),
      )}
    </svg>
  );
}

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
  const xFlat = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const xBold = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const yCursor = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const xCursor = useTransform(scrollYProgress, [0, 1], [0, 60]);

  const kindWord =
    cycle.kind === 'midterm'
      ? t('hero.midterms', { defaultValue: 'Midterms' })
      : t('hero.president', { defaultValue: 'President' });

  const live = phase === 'election-day' || phase === 'counting';

  return (
    <section ref={ref} className="el-hero" aria-labelledby="el-title">
      <div className="el-wrap el-hero__in">
        <p className="el-eyebrow" style={{ margin: '0 0 12px' }}>
          <span className="el-chip el-chip--ink">{cycle.title}</span>{' '}
          <span className="el-chip">{cycle.date}</span>
        </p>

        {/*
          The reference's anti-design type: a black/white checker field; the letters are white with
          `mix-blend-mode: difference`, so they read black on the white cells and white on the black ones
          and invert as they cross. Three treatments of one message — a heavy block word, a word squashed
          flat and stretched wide, a word drawn as a dashed hairline — all cropped by the frame as the page
          scrolls. The heading's accessible name is plain text; the pieces are decoration.
        */}
        <h1 id="el-title" className="el-hero__type" aria-label={`${t('hero.vote', { defaultValue: 'Vote' })} ${cycle.year} ${kindWord}`}>
          <motion.span className="el-hero__row" aria-hidden style={{ x: xBold }}>
            <span className="el-hero__bold">{t('hero.vote', { defaultValue: 'Vote' })}</span>
          </motion.span>
          <motion.span className="el-hero__row el-hero__row--flat" aria-hidden style={{ x: xFlat }}>
            <span className="el-hero__flat">{cycle.year}</span>
          </motion.span>
          <span className="el-hero__row" aria-hidden>
            <svg className="el-hero__dash" viewBox="0 0 1000 130" preserveAspectRatio="none">
              <text
                x="0"
                y="112"
                fontSize="150"
                fontWeight="900"
                textLength="1000"
                lengthAdjust="spacingAndGlyphs"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeDasharray="7 6"
                style={{ fontFamily: 'var(--el-display)', fontStretch: '125%' }}
              >
                {kindWord.toUpperCase()}
              </text>
            </svg>
          </span>
          <motion.span className="el-hero__cursor" aria-hidden style={{ y: yCursor, x: xCursor }}>
            <PixelCursor />
          </motion.span>
        </h1>

        <p className="el-hero__sub">
          {phase === 'upcoming'
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

        {phase === 'upcoming' ? (
          <div className="el-count" role="timer" aria-label={t('hero.countdown', { defaultValue: 'Time until Election Day' })}>
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
        ) : live ? (
          <div style={{ marginTop: 24 }}>
            <span className="el-live">{t('hero.live', { defaultValue: 'LIVE' })}</span>
          </div>
        ) : null}

        <div className="el-hero__ctas">
          <a className="el-btn" href="#results">
            <ArrowDown size={18} aria-hidden />
            {live ? t('hero.ctaLive', { defaultValue: 'Live results' }) : t('hero.ctaResults', { defaultValue: 'The board' })}
          </a>
          <a className="el-btn el-btn--dem" href="#predict">
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
    </section>
  );
}
