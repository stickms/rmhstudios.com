import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { ChamberControl, Party, Race } from '@/lib/elections/types';
import { OFFICE_NAME } from '@/lib/elections/types';
import { ratingLean } from '@/lib/elections/summary';

const pctOf = (n: number, total: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);

type Basis = 'results' | 'current' | 'rated';

function Card({ c, live, races }: { c: ChamberControl; live: boolean; races: Race[] }) {
  const { t } = useTranslation('c-elections');
  // Before any votes: today's control if the source has it, else the ratings. Never "0–0" or
  // "seats not up" masquerading as a score.
  const beforeSum = c.before.DEM + c.before.GOP + c.before.OTH;
  const basis: Basis = live ? 'results' : beforeSum > 0 ? 'current' : 'rated';
  const lean = ratingLean(races);
  const shown =
    basis === 'results'
      ? c.seats
      : basis === 'current'
        ? c.before
        : { DEM: lean.dem, GOP: lean.gop, OTH: 0 };
  const meterTotal = basis === 'rated' ? Math.max(1, lean.dem + lean.gop + lean.tossup) : c.total;
  const isEv = c.office === 'president';
  const unit = isEv
    ? t('bop.ev', { defaultValue: 'electoral votes' })
    : t('bop.seats', { defaultValue: 'seats' });
  const flipsTotal = c.flips.DEM + c.flips.GOP + c.flips.OTH;
  const who = c.controlledBy
    ? t('bop.control', {
        defaultValue: '{{party}} control',
        party: c.controlledBy === 'DEM' ? 'Democratic' : c.controlledBy === 'GOP' ? 'Republican' : 'Independent',
      })
    : null;

  return (
    <motion.section
      className="el-bop__card el-box"
      style={{ position: 'relative' }}
      initial={{ y: 16, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      aria-label={OFFICE_NAME[c.office]}
    >
      {who ? (
        <span
          className={`el-sticker el-stamp`}
          style={{ background: c.controlledBy === 'GOP' ? 'var(--el-gop)' : 'var(--el-dem)', color: '#fff' }}
        >
          {who}
        </span>
      ) : null}
      <div className="el-bop__top">
        <span className="el-bop__name">{OFFICE_NAME[c.office]}</span>
        <span className="el-eyebrow">
          {t('bop.toWin', { defaultValue: '{{n}} to win', n: c.toWin })}
        </span>
      </div>

      <div className="el-bop__nums">
        <div className="el-bop__num el-bop__num--dem">
          {shown.DEM}
          <small>{t('bop.dem', { defaultValue: 'Democrats' })}</small>
        </div>
        <div className="el-bop__num el-bop__num--gop">
          {shown.GOP}
          <small>{t('bop.gop', { defaultValue: 'Republicans' })}</small>
        </div>
      </div>

      <div
        className="el-meter"
        role="img"
        aria-label={t('bop.meter', {
          defaultValue: 'Democrats {{d}}, Republicans {{r}}, {{need}} needed',
          d: shown.DEM,
          r: shown.GOP,
          need: c.toWin,
        })}
      >
        <span className="el-meter__mid" />
        <span className="el-meter__tag">{c.toWin}</span>
        <div className="el-meter__seg el-meter__seg--dem" style={{ width: `${pctOf(shown.DEM, meterTotal)}%` }} />
        {shown.OTH ? (
          <div className="el-meter__seg el-meter__seg--oth" style={{ width: `${pctOf(shown.OTH, meterTotal)}%` }} />
        ) : null}
        <div className="el-meter__seg el-meter__seg--gop" style={{ width: `${pctOf(shown.GOP, meterTotal)}%` }} />
      </div>

      <div className="el-bop__foot">
        <span className="el-chip">
          {t('bop.up', { defaultValue: '{{n}} up for election', n: c.seatsUp })}
        </span>
        {live ? (
          <span className="el-chip el-chip--yellow">
            {t('bop.called', { defaultValue: '{{n}} called', n: c.racesCalled })}
          </span>
        ) : null}
        {flipsTotal > 0 ? (
          <span className="el-chip el-chip--ink">
            {(['DEM', 'GOP', 'OTH'] as Party[])
              .filter((p) => c.flips[p] > 0)
              .map((p) => `${p === 'DEM' ? 'D' : p === 'GOP' ? 'R' : 'I'} +${c.flips[p]}`)
              .join(' · ')}{' '}
            {t('bop.flips', { defaultValue: 'flips' })}
          </span>
        ) : null}
        {basis === 'current' ? (
          <span className="el-chip">{t('bop.current', { defaultValue: 'Current control' })}</span>
        ) : basis === 'rated' ? (
          <span className="el-chip">
            {t('bop.rated', { defaultValue: 'Ratings: {{t}} toss-ups', t: lean.tossup })}
          </span>
        ) : c.derived ? (
          <span className="el-chip">{t('bop.derived', { defaultValue: 'called so far' })}</span>
        ) : null}
      </div>
      <span className="el-sr">{unit}</span>
    </motion.section>
  );
}

export function BalanceOfPower({
  chambers,
  live,
  races,
}: {
  chambers: Partial<Record<ChamberControl['office'], ChamberControl>>;
  live: boolean;
  races: Race[];
}) {
  const order: ChamberControl['office'][] = ['president', 'senate', 'house', 'governor'];
  const cards = order.flatMap((o) => (chambers[o] ? [chambers[o] as ChamberControl] : []));
  if (!cards.length) return null;
  return (
    <div className="el-bop">
      {cards.map((c) => (
        <Card key={c.office} c={c} live={live} races={races.filter((r) => r.office === c.office)} />
      ))}
    </div>
  );
}
