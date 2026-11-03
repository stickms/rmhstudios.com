import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { m as motion } from 'framer-motion';
import type { Party, Race } from '@/lib/elections/types';
import { fmtInt } from './hooks';

const PARTY_CHIP: Record<Party, string> = { DEM: 'dem', GOP: 'gop', OTH: 'oth' };
const PARTY_WORD: Record<Party, string> = { DEM: 'Dem', GOP: 'GOP', OTH: 'Ind' };

const RATING_WORD: Record<string, string> = {
  'solid-dem': 'Solid D',
  'likely-dem': 'Likely D',
  'lean-dem': 'Lean D',
  tossup: 'Toss-up',
  'lean-rep': 'Lean R',
  'likely-rep': 'Likely R',
  'solid-rep': 'Solid R',
};

/** One contest: who is running, how it is going, and — once called — a stamp. */
export function RaceCard({ race, onShare }: { race: Race; onShare?: (race: Race) => void }) {
  const { t } = useTranslation('c-elections');
  const [copied, setCopied] = useState(false);
  const shown = race.candidates.slice(0, race.office === 'house' || race.candidates.length <= 3 ? 3 : 4);
  const hidden = race.candidates.length - shown.length;

  const share = async () => {
    if (onShare) return onShare(race);
    const url = `${location.origin}/elections?race=${encodeURIComponent(race.id)}#races`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the button simply does nothing */
    }
  };

  return (
    <article className="el-race el-box" id={`race-${race.id}`} aria-label={race.label}>
      <header className="el-race__head">
        <div>
          <h3 className="el-race__label">{race.label}</h3>
          {race.primaryParty ? (
            <span className={`el-chip el-chip--${PARTY_CHIP[race.primaryParty]}`}>
              {t('card.primary', { defaultValue: '{{party}} primary', party: PARTY_WORD[race.primaryParty] })}
            </span>
          ) : race.type !== 'General' && !race.special ? (
            <span className="el-chip el-chip--ink">{race.type}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {race.rating ? (
            <span className="el-chip el-chip--yellow">{RATING_WORD[race.rating]}</span>
          ) : null}
          {race.flipped ? (
            <span className="el-chip el-chip--ink">{t('card.flip', { defaultValue: 'Flip' })}</span>
          ) : null}
        </div>
      </header>

      <div className="el-race__cand">
        {shown.map((c) => (
          <CandidateRow key={c.id} c={c} showPct={race.totalVotes > 0} />
        ))}
      </div>
      {hidden > 0 ? (
        <p className="el-eyebrow" style={{ margin: '8px 0 0' }}>
          {t('card.others', { defaultValue: '+{{n}} more on the ballot', n: hidden })}
        </p>
      ) : null}

      {race.status === 'called' && race.winnerParty ? (
        <motion.div
          key={race.winnerParty}
          className={`el-called el-called--${race.winnerParty}`}
          initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
        >
          {race.calledBy.includes('ap')
            ? t('card.calledAp', { defaultValue: 'AP called' })
            : race.calledBy.some((c) => c.endsWith('-final'))
              ? t('card.final', { defaultValue: 'Final count' })
              : t('card.called', { defaultValue: 'Called' })}
        </motion.div>
      ) : null}

      <footer className="el-race__foot">
        <span>
          {race.status === 'upcoming'
            ? t('card.awaiting', { defaultValue: 'Awaiting polls' })
            : race.pctReporting != null
              ? t('card.reporting', {
                  defaultValue: '{{pct}}% in · {{votes}} votes',
                  pct: Math.round(race.pctReporting),
                  votes: fmtInt(race.totalVotes),
                })
              : t('card.counting', { defaultValue: 'Counting' })}
        </span>
        <button type="button" className="el-btn el-btn--ghost el-btn--sm" onClick={share}>
          <Link2 size={14} aria-hidden />
          {copied ? t('card.copied', { defaultValue: 'Copied' }) : t('card.share', { defaultValue: 'Share' })}
        </button>
      </footer>
      {race.official ? (
        <p className="el-eyebrow" style={{ margin: '8px 0 0' }} title={race.official.source}>
          {race.official.agrees
            ? t('card.officialOk', { defaultValue: '✓ Matches the {{src}} count', src: race.official.source })
            : t('card.officialDiff', { defaultValue: '⚠ {{src}} count differs by {{pts}} pts', src: race.official.source, pts: race.official.deltaPts ?? 0 })}
        </p>
      ) : null}
    </article>
  );
}

function CandidateRow({ c, showPct }: { c: Race['candidates'][number]; showPct: boolean }) {
  return (
    <>
      <div className="el-race__name">
        <span style={{ fontWeight: c.won || c.leader ? 900 : 700 }}>
          {c.won ? '✓ ' : ''}
          {c.name}
          {c.incumbent ? ' (i)' : ''}
        </span>
        <span className={`el-chip el-chip--${PARTY_CHIP[c.party]}`}>{PARTY_WORD[c.party]}</span>
      </div>
      <span className="el-race__pct">{showPct ? `${c.pct.toFixed(1)}%` : '—'}</span>
      <div className={`el-bar2 el-bar2--${c.party}`} aria-hidden>
        <i style={{ width: `${showPct ? Math.max(c.pct, c.votes > 0 ? 2 : 0) : 0}%` }} />
      </div>
    </>
  );
}
