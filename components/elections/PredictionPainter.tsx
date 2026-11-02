import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Link2, RotateCcw, Wand2 } from 'lucide-react';
import type { ChamberControl, Office, Race } from '@/lib/elections/types';
import { OFFICE_NAME } from '@/lib/elections/types';
import { STATE_CODES, stateName } from '@/lib/elections/states';
import {
  PAINTABLE,
  decodePicks,
  encodePicks,
  nextPick,
  project,
  raceKey,
  scorePicks,
  type Call,
  type Picks,
} from '@/lib/elections/predict';
import type { Tone } from '@/lib/elections/map-model';
import { TileGrid, type TileCell } from './TileGrid';

const storageKey = (year: number) => `rmh-elections-picks:${year}`;

function readStored(year: number): Picks {
  try {
    return decodePicks(localStorage.getItem(storageKey(year)));
  } catch {
    return {};
  }
}

const TONE: Record<Call, Tone> = { DEM: 'DEM', GOP: 'GOP', TOSS: 'tossup' };

function fromRating(r: Race): Call | undefined {
  if (!r.rating) return undefined;
  if (r.rating === 'tossup') return 'TOSS';
  return r.rating.endsWith('dem') ? 'DEM' : 'GOP';
}

/**
 * "Paint your map": tap a state to cycle Dem → Toss-up → GOP. Picks live in
 * localStorage and in a share link (`?p=`), never the database. Once races are
 * called the painter grades them.
 */
export function PredictionPainter({
  year,
  races,
  chambers,
  offices,
}: {
  year: number;
  races: Race[];
  chambers: Partial<Record<Office, ChamberControl>>;
  offices: Office[];
}) {
  const { t } = useTranslation('c-elections');
  const paintable = offices.filter((o) => PAINTABLE.includes(o));
  const [office, setOffice] = useState<Office>(paintable[0] ?? 'senate');
  const [picks, setPicks] = useState<Picks>({});
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const validKeys = useMemo(() => new Set(races.map(raceKey)), [races]);

  // Load once per cycle: a `?p=` share link wins over local storage.
  useEffect(() => {
    const fromUrl = decodePicks(new URLSearchParams(location.search).get('p'));
    const stored = readStored(year);
    setPicks(Object.keys(fromUrl).length ? { ...stored, ...fromUrl } : stored);
  }, [year]);

  const update = useCallback(
    (next: Picks) => {
      setPicks(next);
      try {
        localStorage.setItem(storageKey(year), encodePicks(next));
      } catch {
        /* private mode: picks last for this visit only */
      }
    },
    [year],
  );

  const officeRaces = useMemo(() => races.filter((r) => r.office === office), [races, office]);
  const byState = useMemo(() => {
    const m = new Map<string, Race[]>();
    for (const r of officeRaces) m.set(r.state, [...(m.get(r.state) ?? []), r]);
    return m;
  }, [officeRaces]);

  const cycleState = (postal: string) => {
    const rs = byState.get(postal);
    setSelected(postal);
    if (!rs) return;
    const next = { ...picks };
    // All of a state's races for this office move together (a regular + a special Senate seat share a tile; picks are per race).
    const first = nextPick(picks[raceKey(rs[0])]);
    for (const r of rs) {
      if (first) next[raceKey(r)] = first;
      else delete next[raceKey(r)];
    }
    update(next);
  };

  const cells = useMemo(() => {
    const out = new Map<string, TileCell>();
    for (const code of STATE_CODES) {
      const rs = byState.get(code);
      if (!rs) {
        out.set(code, { tone: 'none', caption: '', label: `${stateName(code)}: no race` });
        continue;
      }
      const p = picks[raceKey(rs[0])];
      const called = rs.every((r) => r.status === 'called');
      const right = called && p && p !== 'TOSS' && rs[0].winnerParty === p;
      const wrong = called && p && p !== 'TOSS' && rs[0].winnerParty !== p;
      out.set(code, {
        tone: p ? TONE[p] : 'unrated',
        caption: right ? '✓' : wrong ? '✗' : p === 'TOSS' ? 'TOSS' : '',
        label: `${stateName(code)}: ${p ? p : 'unpicked'}${right ? ', correct' : wrong ? ', wrong' : ''}`,
      });
    }
    return out;
  }, [byState, picks]);

  const proj = useMemo(() => project(picks, officeRaces, chambers[office]), [picks, officeRaces, chambers, office]);
  const score = useMemo(() => scorePicks(picks, races.filter((r) => PAINTABLE.includes(r.office))), [picks, races]);
  const painted = Object.keys(picks).filter((k) => validKeys.has(k)).length;

  const fillRatings = () => {
    const next = { ...picks };
    for (const r of officeRaces) {
      const c = fromRating(r);
      if (c) next[raceKey(r)] = c;
    }
    update(next);
  };

  const shareUrl = () => `${location.origin}/elections?cycle=${year}&p=${encodePicks(picks)}#predict`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt(t('predict.copyPrompt', { defaultValue: 'Copy your map link:' }), shareUrl());
    }
  };

  if (!paintable.length) return null;

  return (
    <div className="el-pred">
      <div>
        <div className="el-pick-row" role="group" aria-label={t('map.office', { defaultValue: 'Office' })}>
          {paintable.map((o) => (
            <button key={o} type="button" className="el-btn el-btn--sm" aria-pressed={office === o} onClick={() => setOffice(o)}>
              {OFFICE_NAME[o]}
            </button>
          ))}
        </div>
        <TileGrid
          cells={cells}
          selected={selected}
          onSelect={cycleState}
          ariaLabel={t('predict.aria', { defaultValue: 'Prediction map. Tap a state to cycle Democrat, toss-up, Republican.' })}
        />
        <p className="el-eyebrow" style={{ marginTop: 12 }}>
          {t('predict.how', { defaultValue: 'Tap a state: Dem → Toss-up → GOP → clear.' })}
        </p>
      </div>

      <div>
        <div className="el-proj el-box">
          <h3 className="el-drawer__title">{t('predict.yourCall', { defaultValue: 'Your map' })}</h3>
          <p className="el-bop__num" style={{ fontSize: 48 }}>
            <span style={{ color: 'var(--el-dem)' }}>{proj.DEM}</span>
            <span style={{ margin: '0 10px' }}>–</span>
            <span style={{ color: 'var(--el-gop)' }}>{proj.GOP}</span>
          </p>
          <p className="el-eyebrow">
            {proj.controlledBy
              ? t('predict.controls', {
                  defaultValue: 'You give {{party}} control ({{need}} needed)',
                  party: proj.controlledBy === 'DEM' ? 'Democrats' : 'Republicans',
                  need: proj.toWin,
                })
              : t('predict.open', {
                  defaultValue: '{{n}} seats still open — {{need}} needed for control',
                  n: proj.open,
                  need: proj.toWin,
                })}
          </p>
          <div className="el-pick-row" style={{ marginTop: 14 }}>
            <button type="button" className="el-btn el-btn--sm" onClick={fillRatings}>
              <Wand2 size={14} aria-hidden />
              {t('predict.fill', { defaultValue: 'Fill from ratings' })}
            </button>
            <button type="button" className="el-btn el-btn--sm el-btn--ghost" onClick={() => update({})}>
              <RotateCcw size={14} aria-hidden />
              {t('predict.reset', { defaultValue: 'Reset' })}
            </button>
            <button type="button" className="el-btn el-btn--sm el-btn--pink" onClick={copy} disabled={!painted}>
              {copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
              {copied ? t('predict.copied', { defaultValue: 'Link copied' }) : t('predict.share', { defaultValue: 'Share my map' })}
            </button>
          </div>
        </div>

        <div className="el-proj el-box" aria-live="polite">
          <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
            {t('predict.scoreboard', { defaultValue: 'Scoreboard' })}
          </h3>
          {score.accuracy == null ? (
            <p className="el-eyebrow">
              {t('predict.noScore', { defaultValue: 'Graded the moment your first race is called.' })}
            </p>
          ) : (
            <p className="el-bop__num" style={{ fontSize: 56 }}>{score.accuracy}%</p>
          )}
          <p className="el-eyebrow">
            {t('predict.tally', {
              defaultValue: '{{c}} right · {{w}} wrong · {{p}} pending',
              c: score.correct,
              w: score.wrong,
              p: score.pending,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
