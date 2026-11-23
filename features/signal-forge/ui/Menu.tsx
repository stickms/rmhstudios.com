/**
 * Signal Forge's main menu: the forge backdrop, the wordmark, the run controls (continue, a new run with its
 * rhythm mode and Ascension), the tutorial, the Codex, help and the leaderboard. Signed out, the run controls
 * become "Sign in to play"; the tutorial, the Codex and help stay open (nothing there is saved or scored).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContentText } from './useContentText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { ASCENSION } from '@features/signal-forge/engine/balance';
import { floorOf } from '@features/signal-forge/engine/run';
import type { SaveMeta } from '@features/signal-forge/engine/save';
import type { RhythmMode, RunState } from '@features/signal-forge/engine/types';
import { useSiteNavigate } from '@/hooks/useSiteNavigate';
import { Icon, WaveGlyph } from './art/glyphs';
import { LeaderboardPanel } from './Modals';

interface Props {
  signedIn: boolean;
  loading: boolean;
  saved: RunState | null;
  retired: { floor: number; score: number } | null;
  meta: SaveMeta;
  mode: RhythmMode;
  onMode: (m: RhythmMode) => void;
  onContinue: () => void;
  onNewRun: (ascension: number) => void;
  onTutorial: () => void;
  onCodex: () => void;
  onHelp: () => void;
  onDismissRetired: () => void;
}

export function Menu(p: Props) {
  const { t } = useTranslation('c-signal-forge');
  const lbl = useContentText();
  const fmt = useLocaleFormat();
  const navigate = useSiteNavigate();
  const [asc, setAsc] = useState(p.meta.ascensionUnlocked);
  const level = Math.min(asc, p.meta.ascensionUnlocked);
  return (
    <div className="sf-menu">
      <div className="sf-menu-main">
        <img className="sf-logo" src="/images/games/logos/signal-forge.webp" alt={t('title', { defaultValue: 'Signal Forge' })} width={1024} height={360} />
        <p className="sf-tagline">{t('menu.tagline', { defaultValue: 'Land the phrase. Bank the heat. Fire the forge.' })}</p>

        {p.retired && (
          <div className="sf-notice" role="status">
            <p>
              {t('menu.retired', {
                defaultValue: 'Your run from the old Forge (floor {{floor}}, score {{score}}) was retired with the rework. Its leaderboard entry stays.',
                floor: p.retired.floor,
                score: fmt.number(p.retired.score),
              })}
            </p>
            <button type="button" className="sf-btn sf-btn-ghost" onClick={p.onDismissRetired}>
              {t('menu.retired-ok', { defaultValue: 'Understood' })}
            </button>
          </div>
        )}

        <div className="sf-menu-panel">
          {!p.signedIn ? (
            <>
              <p className="sf-muted">{t('menu.signin-why', { defaultValue: 'Runs are saved to your account and scored on the leaderboard.' })}</p>
              <button type="button" className="sf-btn sf-btn-hot sf-btn-lg" onClick={() => navigate('/login')}>
                {t('menu.sign-in', { defaultValue: 'Sign In to Play' })}
              </button>
            </>
          ) : (
            <>
              {p.saved && (
                <button type="button" className="sf-btn sf-btn-hot sf-btn-lg" onClick={p.onContinue}>
                  {t('menu.continue', { defaultValue: 'Continue: Act {{act}}, floor {{floor}}', act: p.saved.act, floor: floorOf(p.saved) })}
                </button>
              )}
              <fieldset className="sf-setup">
                <legend className="sf-label">{t('menu.mode', { defaultValue: 'Rhythm' })}</legend>
                <div className="sf-seg" role="radiogroup" aria-label={t('menu.mode', { defaultValue: 'Rhythm' })}>
                  {(['steady', 'timed'] as RhythmMode[]).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={p.mode === m} className="sf-seg-btn" onClick={() => p.onMode(m)}>
                      <WaveGlyph wave={m === 'timed' ? 'pulse' : 'sine'} size={18} />
                      {m === 'timed' ? t('mode.timed', { defaultValue: 'Timed' }) : t('mode.steady', { defaultValue: 'Steady' })}
                    </button>
                  ))}
                </div>
                <p className="sf-muted sf-small">
                  {p.mode === 'timed'
                    ? t('menu.timed-text', { defaultValue: 'Play to the beat: Perfect hits hardest. Sound helps.' })
                    : t('menu.steady-text', { defaultValue: 'No clock. Every card on the phrase counts as Good.' })}
                </p>
                <div className="sf-asc">
                  <span className="sf-label">{t('menu.ascension', { defaultValue: 'Ascension' })}</span>
                  <button type="button" className="sf-iconbtn" disabled={level <= 0} onClick={() => setAsc(Math.max(0, level - 1))} aria-label={t('menu.asc-down', { defaultValue: 'Lower Ascension' })}>
                    -
                  </button>
                  <b className="sf-mono sf-asc-n" aria-live="polite">
                    {level}
                  </b>
                  <button type="button" className="sf-iconbtn" disabled={level >= p.meta.ascensionUnlocked} onClick={() => setAsc(level + 1)} aria-label={t('menu.asc-up', { defaultValue: 'Raise Ascension' })}>
                    +
                  </button>
                  <span className="sf-muted sf-small">
                    {level === 0
                      ? p.meta.ascensionUnlocked === 0
                        ? t('menu.asc-locked', { defaultValue: 'Win a run to open Ascension 1.' })
                        : t('menu.asc-zero', { defaultValue: 'No modifiers.' })
                      : lbl(`asc.${level}`, ASCENSION[level - 1]?.text ?? '')}
                  </span>
                </div>
              </fieldset>
              <button type="button" className={`sf-btn sf-btn-lg${p.saved ? '' : ' sf-btn-hot'}`} disabled={p.loading} onClick={() => p.onNewRun(level)}>
                {p.saved ? t('menu.new-run-over', { defaultValue: 'New run (abandons the current one)' }) : t('menu.new-run', { defaultValue: 'New run' })}
              </button>
            </>
          )}
          <div className="sf-menu-row">
            <button type="button" className={`sf-btn${p.meta.tutorialDone ? '' : ' sf-btn-cyan'}`} onClick={p.onTutorial}>
              {p.meta.tutorialDone ? t('menu.tutorial', { defaultValue: 'Tutorial' }) : t('menu.tutorial-new', { defaultValue: 'New here? Tutorial' })}
            </button>
            <button type="button" className="sf-btn" onClick={p.onCodex}>
              {t('menu.codex', { defaultValue: 'Codex' })}
            </button>
            <button type="button" className="sf-btn" onClick={p.onHelp}>
              <Icon name="help" size={14} /> {t('menu.help', { defaultValue: 'How to play' })}
            </button>
          </div>
          {p.meta.wins > 0 && (
            <p className="sf-muted sf-small">
              {t('menu.record', { defaultValue: '{{wins}} wins in {{runs}} runs', wins: p.meta.wins, runs: p.meta.runs })}
            </p>
          )}
        </div>
      </div>
      <aside className="sf-menu-side">
        <LeaderboardPanel compact />
      </aside>
    </div>
  );
}
