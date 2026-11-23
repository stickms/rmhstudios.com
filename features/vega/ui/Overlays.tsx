/**
 * Project Vega's board overlays: the tutorial card and its bench marker, the dossier of a newly catalogued
 * specimen, the case log, and the pause, containment and manual dialogs.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ENEMIES, TOWER_ORDER, TOWERS, WAVES, type EnemyType } from '@features/vega/engine/data';
import { useGameStore, type LogLine } from '@features/vega/engine/GameState';
import { readCatalogued } from '@features/vega/engine/VegaGame';
import { InstrumentGlyph, SpecimenGlyph } from './Glyph';
import { useVegaNames } from './names';

/** Move focus into a dialog when it opens and back where it was when it closes. */
function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href]')?.focus();
    return () => prev?.focus?.();
  }, []);
  return ref;
}

// ── Tutorial ───────────────────────────────────────────────────────────────

export function TutorialCard({ bench, onFinish }: { bench: { cx: number; cy: number } | null; onFinish: () => void }) {
  const { t } = useTranslation('c-vega');
  const step = useGameStore((s) => s.tutorial.step);
  const tutorialEvent = useGameStore((s) => s.tutorialEvent);
  useEffect(() => {
    if (step === 'done') onFinish();
  }, [step, onFinish]);
  if (step === 'done') return null;

  let title = '';
  let body = '';
  switch (step) {
    case 'welcome':
      title = t('tut-welcome-title', { defaultValue: 'Intake briefing' });
      body = t('tut-welcome-body', {
        defaultValue:
          'This monitor is the specimen slide. Specimens crawl along the red corridor toward the containment door. Instruments on the benches stop them.',
      });
      break;
    case 'select':
      title = t('tut-select-title', { defaultValue: 'Choose an instrument' });
      body = t('tut-select-body', { defaultValue: 'Pick the Synapse from the formulary, or press 1.' });
      break;
    case 'place':
      title = t('tut-place-title', { defaultValue: 'Put it on a bench' });
      body = t('tut-place-body', {
        defaultValue:
          'Place it on the marked bench beside the corridor, or move the cursor with the arrow keys and press Enter. On a phone, tap once to preview and again to place.',
      });
      break;
    case 'start':
      title = t('tut-start-title', { defaultValue: 'Start the wave' });
      body = t('tut-start-body', { defaultValue: 'The board waits until you are ready. Start wave 1, or press Space.' });
      break;
    case 'watch':
      title = t('tut-watch-title', { defaultValue: 'Hold the wave' });
      body = t('tut-watch-body', { defaultValue: 'Every kill pays serum. Clearing the wave pays more. Build while you wait.' });
      break;
    case 'upgrade':
      title = t('tut-upgrade-title', { defaultValue: 'Upgrade' });
      body = t('tut-upgrade-body', { defaultValue: 'Select your Synapse on the board and upgrade it to tier II, or press U.' });
      break;
    case 'integrity':
      title = t('tut-integrity-title', { defaultValue: 'Integrity' });
      body = t('tut-integrity-body', {
        defaultValue:
          'Each specimen that reaches the door costs integrity; at zero the case is closed. Every fifth wave is a boss. Hold to wave 40 for containment.',
      });
      break;
  }
  const info = step === 'welcome' || step === 'integrity';
  const c = 100 / 20;
  const r = 100 / 13;
  return (
    <>
      {step === 'place' && bench && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `${bench.cx * c}%`,
            top: `${bench.cy * r}%`,
            width: `${c}%`,
            height: `${r}%`,
            boxShadow: '0 0 0 2px var(--vg-amber)',
            pointerEvents: 'none',
          }}
        />
      )}
      <section className="vg-card" style={{ top: 12, left: '50%', transform: 'translateX(-50%)' }} aria-live="polite" data-vega-tutorial={step}>
        <h2 className="vg-tag">
          {t('tut-label', { defaultValue: 'Tutorial' })} · {title}
        </h2>
        <p>{body}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {info && (
            <button type="button" className="vg-btn vg-btn-sm vg-btn-primary" onClick={() => tutorialEvent({ type: 'next' })}>
              {step === 'welcome' ? t('tut-begin', { defaultValue: 'Begin' }) : t('tut-done', { defaultValue: 'Got it' })}
            </button>
          )}
          <button type="button" className="vg-btn vg-btn-sm" onClick={() => tutorialEvent({ type: 'skip' })}>
            {t('tut-skip', { defaultValue: 'Skip tutorial' })}
          </button>
        </div>
      </section>
    </>
  );
}

// ── Dossier ───────────────────────────────────────────────────────────────

export function DossierCard() {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const dossier = useGameStore((s) => s.dossier);
  const tutorial = useGameStore((s) => s.tutorial.step);
  const setDossier = useGameStore((s) => s.setDossier);
  if (!dossier || tutorial !== 'done') return null;
  const boss = !!ENEMIES[dossier].boss;
  return (
    <section className={boss ? 'vg-card is-danger' : 'vg-card'} style={{ top: 12, right: 12 }} aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h2 className={boss ? 'vg-tag is-danger' : 'vg-tag'}>
          {boss ? t('dossier-boss', { defaultValue: 'Boss specimen on the next wave' }) : t('dossier-new', { defaultValue: 'New specimen catalogued' })}
        </h2>
        <button type="button" className="vg-icon-btn" style={{ minWidth: 32, minHeight: 32 }} aria-label={t('dismiss', { defaultValue: 'Dismiss' })} onClick={() => setDossier(null)}>
          <X aria-hidden size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <SpecimenGlyph type={dossier} size={56} />
        <div>
          <p className="vg-title" style={{ margin: 0, fontSize: 22 }}>
            {names.enemy(dossier)}
          </p>
          <p style={{ margin: '4px 0 0' }}>{names.enemyBlurb(dossier)}</p>
        </div>
      </div>
    </section>
  );
}

// ── Case log ──────────────────────────────────────────────────────────────

export function CaseLog() {
  const log = useGameStore((s) => s.log);
  return (
    <div className="vg-log" aria-live="polite">
      {log.slice(0, 4).map((l) => (
        <LogEntry key={l.id} line={l} />
      ))}
    </div>
  );
}

function LogEntry({ line }: { line: LogLine }) {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const enemy = line.enemy ? names.enemy(line.enemy) : '';
  let text = '';
  let tone = '';
  switch (line.kind) {
    case 'waveStart':
      text = t('log-wave-start', { defaultValue: 'Wave {{wave}} admitted.', wave: line.wave });
      break;
    case 'waveEarly':
      text = t('log-wave-early', { defaultValue: 'Wave {{wave}} called early.', wave: line.wave });
      tone = 'is-good';
      break;
    case 'boss':
      text = t('log-boss', { defaultValue: 'Wave {{wave}}: {{enemy}} is loose.', wave: line.wave, enemy });
      tone = 'is-bad';
      break;
    case 'waveClear':
      text = t('log-wave-clear', { defaultValue: 'Wave {{wave}} held. +{{amount}} serum.', wave: line.wave, amount: line.amount });
      tone = 'is-good';
      break;
    case 'perfect':
      text = t('log-wave-perfect', { defaultValue: 'Wave {{wave}} held clean. +{{amount}} serum.', wave: line.wave, amount: line.amount });
      tone = 'is-good';
      break;
    case 'leak':
      text = t('log-leak', { defaultValue: '{{enemy}} breached containment. -{{amount}} integrity.', enemy, amount: line.amount });
      tone = 'is-bad';
      break;
    case 'catalogued':
      text = t('log-catalogued', { defaultValue: 'New specimen catalogued: {{enemy}}.', enemy });
      break;
    case 'funds':
      text = t('log-funds', { defaultValue: 'Not enough serum.' });
      tone = 'is-bad';
      break;
    case 'blocked':
      text = t('log-blocked', { defaultValue: 'Instruments go on free benches only.' });
      tone = 'is-bad';
      break;
    case 'sever':
      text = t('log-sever', { defaultValue: 'The Surgeon severed nearby instruments.' });
      tone = 'is-bad';
      break;
    case 'victory':
      text = t('log-victory', { defaultValue: 'Containment achieved.' });
      tone = 'is-good';
      break;
    case 'resumed':
      text = t('log-resumed', { defaultValue: 'Case reopened after wave {{wave}}.', wave: line.wave });
      break;
  }
  return <p className={tone || undefined}>{text}</p>;
}

// ── Dialogs ───────────────────────────────────────────────────────────────

export function PauseDialog({ onAbandon, onQuit }: { onAbandon: () => void; onQuit: () => void }) {
  const { t } = useTranslation('c-vega');
  const setPaused = useGameStore((s) => s.setPaused);
  const setManualOpen = useGameStore((s) => s.setManualOpen);
  const ref = useDialogFocus<HTMLDivElement>();
  return (
    <div className="vg-scrim" role="dialog" aria-modal="true" aria-labelledby="vg-pause-title">
      <div className="vg-dialog" ref={ref} style={{ width: 'min(380px, 100%)' }}>
        <h2 id="vg-pause-title" className="vg-title" style={{ margin: 0, fontSize: 34 }}>
          {t('paused', { defaultValue: 'Paused' })}
        </h2>
        <p style={{ color: 'var(--vg-muted)', fontSize: 14 }}>
          {t('paused-body', { defaultValue: 'The run is saved after every wave you clear. Quitting keeps the last save.' })}
        </p>
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          <button type="button" className="vg-btn vg-btn-primary" onClick={() => setPaused(false)}>
            {t('resume', { defaultValue: 'Resume' })}
          </button>
          <button type="button" className="vg-btn" onClick={() => setManualOpen(true)}>
            {t('manual', { defaultValue: 'Manual' })}
          </button>
          <button type="button" className="vg-btn" onClick={onQuit}>
            {t('quit-to-menu', { defaultValue: 'Quit to menu' })}
          </button>
          <button type="button" className="vg-btn vg-btn-danger" onClick={onAbandon}>
            {t('abandon', { defaultValue: 'Close the case' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VictoryDialog({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  const { t } = useTranslation('c-vega');
  const score = useGameStore((s) => s.hud.score);
  const ref = useDialogFocus<HTMLDivElement>();
  return (
    <div className="vg-scrim" role="dialog" aria-modal="true" aria-labelledby="vg-victory-title">
      <div className="vg-dialog" ref={ref} style={{ borderTop: '3px solid var(--vg-mint)' }}>
        <h2 className="vg-tag">{t('victory-kicker', { defaultValue: 'Wave {{wave}} held', wave: WAVES.GOAL })}</h2>
        <h3 id="vg-victory-title" className="vg-title" style={{ margin: '8px 0 0', fontSize: 42 }}>
          {t('victory-title', { defaultValue: 'Containment achieved' })}
        </h3>
        <p style={{ color: 'var(--vg-muted)' }}>
          {t('victory-body', {
            defaultValue: 'The specimen is contained. Score so far {{score}}, integrity bonus included. Overtime continues to wave {{cap}}, harder every wave.',
            score: score.toLocaleString(),
            cap: WAVES.CAP,
          })}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" className="vg-btn vg-btn-primary" onClick={onContinue}>
            {t('continue-overtime', { defaultValue: 'Continue into overtime' })}
          </button>
          <button type="button" className="vg-btn" onClick={onClose}>
            {t('close-case', { defaultValue: 'File the report' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualDialog({ onReplayTutorial }: { onReplayTutorial: (() => void) | null }) {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const setManualOpen = useGameStore((s) => s.setManualOpen);
  const ref = useDialogFocus<HTMLDivElement>();
  const seen = new Set<EnemyType>(readCatalogued());
  const specimens = (Object.keys(ENEMIES) as EnemyType[]).filter((e) => e !== 'FRAGMENT');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManualOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setManualOpen]);
  return (
    <div className="vg-scrim" role="dialog" aria-modal="true" aria-labelledby="vg-manual-title" style={{ zIndex: 30 }}>
      <div className="vg-dialog" ref={ref} style={{ width: 'min(760px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <h2 id="vg-manual-title" className="vg-title" style={{ margin: 0, fontSize: 34 }}>
            {t('manual-title', { defaultValue: 'Operator manual' })}
          </h2>
          <button type="button" className="vg-icon-btn" aria-label={t('close', { defaultValue: 'Close' })} onClick={() => setManualOpen(false)}>
            <X aria-hidden size={18} />
          </button>
        </div>

        <h3 className="vg-tag" style={{ marginTop: 18 }}>
          {t('manual-protocol', { defaultValue: 'Protocol' })}
        </h3>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: 'var(--vg-ink)' }}>
          <li>{t('manual-rule-build', { defaultValue: 'Between waves the board waits. Build, upgrade and sell, then start the wave.' })}</li>
          <li>{t('manual-rule-early', { defaultValue: 'Once a wave has finished arriving you may call the next one early: extra serum and x1.25 score for that wave.' })}</li>
          <li>{t('manual-rule-score', { defaultValue: 'A cleared wave scores 40 x its number, x1.2 if nothing got through, x the map. Containment at wave 40 adds 250 per point of integrity left.' })}</li>
          <li>{t('manual-rule-boss', { defaultValue: 'Every fifth wave brings a boss. A boss that reaches the door costs 8 or more integrity.' })}</li>
        </ul>

        <h3 className="vg-tag" style={{ marginTop: 18 }}>
          {t('manual-controls', { defaultValue: 'Controls' })}
        </h3>
        <dl className="vg-stat-grid" style={{ gridTemplateColumns: 'auto 1fr', fontSize: 14 }}>
          <dt>{t('key-click', { defaultValue: 'Click / tap' })}</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-click-do', { defaultValue: 'Place the chosen instrument, or select one (on a phone: tap twice to place)' })}</dd>
          <dt>1-8</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-digits-do', { defaultValue: 'Choose an instrument' })}</dd>
          <dt>{t('key-arrows', { defaultValue: 'Arrows, Enter' })}</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-arrows-do', { defaultValue: 'Move the board cursor and act on its bench' })}</dd>
          <dt>{t('key-space', { defaultValue: 'Space' })}</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-space-do', { defaultValue: 'Start the wave, or call the next one early' })}</dd>
          <dt>U · Del · T · F</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-letters-do', { defaultValue: 'Upgrade, sell, change targeting, double speed' })}</dd>
          <dt>Esc</dt>
          <dd style={{ fontFamily: 'inherit' }}>{t('key-esc-do', { defaultValue: 'Cancel, or pause' })}</dd>
        </dl>

        <h3 className="vg-tag" style={{ marginTop: 18 }}>
          {t('formulary', { defaultValue: 'Formulary' })}
        </h3>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {TOWER_ORDER.map((type) => (
            <li key={type} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--vg-line)' }}>
              <InstrumentGlyph type={type} size={36} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {names.tower(type)} <span className="vg-mono" style={{ color: 'var(--vg-mint)', fontWeight: 400, fontSize: 13 }}>{TOWERS[type].tiers[0].cost}</span>
                </p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--vg-muted)' }}>{names.towerBlurb(type)}</p>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="vg-tag" style={{ marginTop: 18 }}>
          {t('manual-specimens', { defaultValue: 'Specimens' })}
        </h3>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {specimens.map((type) => {
            const known = seen.has(type) || type === 'ANXIETY';
            return (
              <li key={type} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--vg-line)' }}>
                <SpecimenGlyph type={type} size={36} hidden={!known} />
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{known ? names.enemy(type) : t('uncatalogued', { defaultValue: 'Uncatalogued' })}</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--vg-muted)' }}>
                    {known ? names.enemyBlurb(type) : t('uncatalogued-body', { defaultValue: 'Not yet observed. Hold more waves.' })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {onReplayTutorial && (
            <button type="button" className="vg-btn" onClick={onReplayTutorial}>
              {t('replay-tutorial', { defaultValue: 'Replay the tutorial' })}
            </button>
          )}
          <button type="button" className="vg-btn vg-btn-primary" onClick={() => setManualOpen(false)}>
            {t('close', { defaultValue: 'Close' })}
          </button>
        </div>
      </div>
    </div>
  );
}
