import { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Share2 } from 'lucide-react';
import { countdownTo, type Cycle, type Phase } from '@/lib/elections/calendar';
import { useNow } from './hooks';

const pad = (n: number) => String(n).padStart(2, '0');

function Burst({ fill }: { fill: string }) {
  // A 16-point starburst — the sticker shape.
  const pts = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r = i % 2 ? 38 : 50;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <polygon points={pts} fill={fill} stroke="#0b0b0b" strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}

function Cursor() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#0b0b0b" strokeWidth="2" strokeLinejoin="miter" />
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
  const yTitle = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const xOut = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const xDem = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const yBurst = useTransform(scrollYProgress, [0, 1], [0, 180]);
  const rBurst = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const yCursor = useTransform(scrollYProgress, [0, 1], [0, -240]);
  const yBlock = useTransform(scrollYProgress, [0, 1], [0, 90]);

  const kindWord =
    cycle.kind === 'midterm'
      ? t('hero.midterms', { defaultValue: 'Midterms' })
      : t('hero.president', { defaultValue: 'President' });

  const live = phase === 'election-day' || phase === 'counting';

  return (
    <section ref={ref} className="el-hero" aria-labelledby="el-title">
      <motion.div className="el-hero__deco" style={{ y: yBurst, rotate: rBurst, right: '-4%', top: '4%', width: 'clamp(84px, 26vw, 360px)' }}>
        <Burst fill="var(--el-yellow)" />
      </motion.div>
      <motion.div
        className="el-hero__deco el-hero__deco--block"
        style={{ y: yBlock, left: '-3%', bottom: '8%', width: 'clamp(90px, 16vw, 220px)', aspectRatio: '1', background: 'var(--el-dem)', border: '3px solid var(--el-ink)', boxShadow: '8px 8px 0 var(--el-ink)', transform: 'rotate(8deg)' }}
      />
      <motion.div className="el-hero__deco el-hero__deco--cursor" style={{ y: yCursor, right: '14%', bottom: '14%', width: 'clamp(36px, 6vw, 80px)' }}>
        <Cursor />
      </motion.div>

      <div className="el-wrap el-hero__in">
        <p className="el-eyebrow" style={{ margin: '0 0 12px' }}>
          <span className="el-chip el-chip--ink">{cycle.title}</span>{' '}
          <span className="el-chip">{cycle.date}</span>
        </p>

        <motion.h1 id="el-title" className="el-hero__title" style={{ y: yTitle }}>
          <span className="el-hero__line">{t('hero.vote', { defaultValue: 'Vote' })}</span>
          <motion.span className="el-hero__line el-hero__line--out" style={{ x: xOut }}>
            {cycle.year}
          </motion.span>
          <motion.span className="el-hero__line el-hero__line--dem el-hero__line--kind" style={{ x: xDem }}>
            <span className="el-hero__stretch">{kindWord}</span>
          </motion.span>
        </motion.h1>

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

        <div className="el-hero__row">
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
