import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChamberLean } from '@/lib/elections/liquid';
import { GlobeCanvas, type GlobeHandle } from './GlobeCanvas';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** The liquid globe: where each chamber is leaning right now, as two liquids in a glass sphere. */
export function LiquidGlobe({ leans }: { leans: Partial<Record<'senate' | 'house', ChamberLean | null>> }) {
  const { t } = useTranslation('c-elections');
  const available = (['senate', 'house'] as const).filter((o) => leans[o]);
  const [pick, setPick] = useState<'senate' | 'house'>('senate');
  const office = available.includes(pick) ? pick : available[0];
  const lean = office ? leans[office] : null;
  const globe = useRef<GlobeHandle | null>(null);
  const [size, setSize] = useState(380);
  useEffect(() => {
    const fit = () => setSize(Math.max(240, Math.min(420, window.innerWidth - 72)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const word =
    !lean
      ? ''
      : lean.basis === 'final'
        ? lean.dem > lean.gop
          ? t('globe.finalDem', { defaultValue: 'Democrats win it' })
          : t('globe.finalGop', { defaultValue: 'Republicans win it' })
        : lean.lean === 'even'
          ? t('globe.even', { defaultValue: 'Too close to call' })
          : lean.lean === 'dem'
            ? t('globe.leanDem', { defaultValue: 'Leans Democratic' })
            : t('globe.leanGop', { defaultValue: 'Leans Republican' });

  return (
    <section className="el-wrap el-globe" aria-label={t('globe.title', { defaultValue: 'Control of Congress' })}>
      <div className="el-globe__frame el-box">
        <div className="el-globe__stage">
          {lean ? (
            <GlobeCanvas
              share={lean.demShare}
              majority={lean.majorityShare}
              uncertainty={lean.basis === 'final' ? 0 : Math.min(1, lean.undecided / 40)}
              size={size}
              handle={globe}
            />
          ) : (
            <div className="el-globe__empty" style={{ width: size, height: size }} />
          )}
        </div>

        <div className="el-globe__panel">
          <p className="el-globe__hint">
            {t('globe.hint', { defaultValue: 'Drag the globe to rotate it. Double-click to reset.' })}{' '}
            <button type="button" className="el-btn el-btn--sm" onClick={() => globe.current?.reset()}>
              {t('globe.reset', { defaultValue: 'Reset view' })}
            </button>
          </p>
          <p className="el-eyebrow" style={{ margin: 0 }}>
            {t('globe.eyebrow', { defaultValue: 'Which way is it leaning?' })}
          </p>
          <div className="el-pick-row" role="group" aria-label={t('globe.chamber', { defaultValue: 'Chamber' })}>
            {(['senate', 'house'] as const).map((o) => (
              <button key={o} type="button" className="el-btn el-btn--sm" aria-pressed={office === o} disabled={!leans[o]} onClick={() => setPick(o)}>
                {o === 'senate' ? t('globe.senate', { defaultValue: 'Senate' }) : t('globe.house', { defaultValue: 'House' })}
              </button>
            ))}
          </div>

          {lean ? (
            <>
              <h2 className="el-globe__word">{word}</h2>
              <div className="el-globe__nums">
                <span className="el-globe__d">
                  <strong>{num(lean.dem)}</strong> {t('globe.dem', { defaultValue: 'Democratic seats' })}
                </span>
                <span className="el-globe__r">
                  <strong>{num(lean.gop)}</strong> {t('globe.gop', { defaultValue: 'Republican seats' })}
                </span>
              </div>
              <p className="el-globe__odds">
                {t('globe.control', { defaultValue: 'Chance of control: Democrats {{d}} · Republicans {{r}}', d: pct(lean.demControl), r: pct(lean.gopControl) })}
                {1 - lean.demControl - lean.gopControl > 0.03
                  ? t('globe.tie', { defaultValue: ' · neither (a tie) {{n}}', n: pct(1 - lean.demControl - lean.gopControl) })
                  : ''}
              </p>
              <p className="el-eyebrow" style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
                {lean.basis === 'final'
                  ? t('globe.noteFinal', { defaultValue: 'Every race is decided. Dashed line: {{n}} seats for a majority.', n: lean.toWin })
                  : t('globe.note', {
                      defaultValue:
                        'An indicative model from ratings and the count so far, not a forecast. {{n}} races still open. Dashed line: {{w}} seats for a majority.',
                      n: lean.undecided,
                      w: lean.toWin,
                    })}
              </p>
            </>
          ) : (
            <p className="el-globe__word">{t('globe.waiting', { defaultValue: 'The globe fills in once the chamber tallies are published.' })}</p>
          )}
        </div>
      </div>
    </section>
  );
}
