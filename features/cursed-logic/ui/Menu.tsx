/**
 * The boot screen: the wordmark, the ladder (five sectors and who waits in them), the Pacts, and the commands.
 * Signed out, the run command becomes "Sign in to play"; the training duel and the help stay open to everyone.
 */
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { SECTORS } from '@features/cursed-logic/engine/data';
import { pactMultiplier } from '@features/cursed-logic/engine/score';
import { readSavedRun } from '@features/cursed-logic/engine/gameState';
import type { PactId } from '@features/cursed-logic/engine/types';
import { Portrait } from './portraits';
import { Wordmark } from './glyphs';
import { Leaderboard } from './Leaderboard';
import type { Copy } from './copy';

const PACT_ORDER: PactId[] = ['chaosRun', 'glassCannon', 'doubleDown', 'blackout'];

interface Props {
  copy: Copy;
  signedIn: boolean;
  sessionPending: boolean;
  tutorialDone: boolean;
  minigames: boolean;
  onStart: (pacts: PactId[]) => void;
  onResume: () => void;
  onTutorial: () => void;
  onHelp: () => void;
  onMinigames: (on: boolean) => void;
}

export function Menu({ copy, signedIn, sessionPending, tutorialDone, minigames, onStart, onResume, onTutorial, onHelp, onMinigames }: Props) {
  const { t } = useTranslation('c-cursed-logic');
  const [pacts, setPacts] = useState<PactId[]>([]);
  const [saved] = useState(() => readSavedRun());
  const mult = pactMultiplier(pacts);
  const toggle = (p: PactId) => setPacts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 pb-8 grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="pt-2 flex items-center gap-4">
          <div className="min-w-0 flex-1">
          <Wordmark className="w-full max-w-[520px] h-auto" title={t('title', { defaultValue: 'Cursed Logic' })} />
          <p className="mt-1 text-[0.85rem]">
            {t('tagline', { defaultValue: 'Read the rogue Protocols, call their bluffs, and reach the root.' })}
          </p>
          <ul className="mt-3 text-[0.72rem] cl-muted flex flex-col gap-0.5">
            <li className="cl-prompt">{t('boot-1', { defaultValue: 'mount /dev/protocols ... 7 processes found' })}</li>
            <li className="cl-prompt">{t('boot-2', { defaultValue: 'integrity check ... carried between duels' })}</li>
            <li className="cl-prompt">{t('boot-3', { defaultValue: 'warning: tells may be lies' })}</li>
          </ul>
          </div>
          <Portrait id="nullroot" size={150} className="hidden sm:block shrink-0" />
        </div>

        {/* The ladder */}
        <section className="cl-window">
          <div className="cl-window-title">{t('ladder-title', { defaultValue: 'THE LADDER :: 5 SECTORS, 9 DUELS' })}</div>
          <ol className="grid grid-cols-5 gap-1 p-3">
            {SECTORS.map((s) => (
              <li key={s.index} className="flex flex-col items-center gap-1 relative">
                <span className={`cl-display text-[0.7rem] ${s.index === 5 ? 'cl-danger' : 'cl-acid'}`}>
                  {s.index === 5 ? t('ladder-root', { defaultValue: 'ROOT' }) : t('ladder-s', { defaultValue: 'S{{n}}', n: s.index })}
                </span>
                <div className="flex flex-wrap justify-center gap-0.5">
                  {s.pool.map((p) => (
                    <span key={p} title={copy.protocolName(p)}>
                      <Portrait id={p} size={s.index === 5 ? 48 : 32} ring={false} />
                    </span>
                  ))}
                </div>
                <span className="text-[0.6rem] cl-muted text-center">
                  {s.shop
                    ? t('ladder-duels-shop', { defaultValue: '{{n}} duels, shop', n: s.duels })
                    : t('ladder-boss', { defaultValue: 'final duel' })}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Pacts */}
        <section className="cl-window">
          <div className="cl-window-title">
            {t('pacts-title', { defaultValue: 'PACTS :: OPTIONAL CURSES' })}
            <span className="ml-auto cl-acid">{t('pacts-mult', { defaultValue: 'score x{{m}}', m: mult.toFixed(2) })}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 p-3">
            {PACT_ORDER.map((p) => {
              const on = pacts.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p)}
                  className={`cl-chip text-left flex-col !items-start min-h-11 py-2 ${on ? 'cl-chip-acid' : ''}`}
                >
                  <span className="cl-display text-[0.75rem]">
                    {on ? '■ ' : '□ '}
                    {copy.pactName(p)}
                  </span>
                  <span className="cl-muted text-[0.68rem]">{copy.pactRule(p)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {!tutorialDone && (
          <p className="text-[0.78rem] cl-acid cl-prompt">
            {t('first-visit', { defaultValue: 'New here? The training duel teaches the whole loop in about two minutes.' })}
          </p>
        )}
        {/* Commands */}
        <div className="flex flex-wrap gap-2">
          {saved && signedIn && (
            <button type="button" className="cl-cmd" onClick={onResume}>
              {t('resume', { defaultValue: 'Resume run (sector {{n}})', n: saved.run.sector })}
            </button>
          )}
          {signedIn ? (
            <button type="button" className="cl-cmd cl-cmd-primary" onClick={() => onStart(pacts)}>
              {saved ? t('new-run', { defaultValue: 'New run' }) : t('start-run', { defaultValue: 'Start run' })}
            </button>
          ) : (
            <a className="cl-cmd cl-cmd-primary" href="/login?redirect=%2Fcursed-logic" aria-disabled={sessionPending}>
              {t('sign-in-to-play', { defaultValue: 'Sign In to Play' })}
            </a>
          )}
          <button type="button" className={`cl-cmd ${tutorialDone ? 'cl-cmd-ghost' : ''}`} onClick={onTutorial}>
            {tutorialDone
              ? t('replay-training', { defaultValue: 'Replay training' })
              : t('training', { defaultValue: 'Training duel' })}
          </button>
          <button type="button" className="cl-cmd cl-cmd-ghost" onClick={onHelp}>
            {t('how-to-play', { defaultValue: 'How to play' })}
          </button>
        </div>
        {!signedIn && !sessionPending && (
          <p className="text-[0.72rem] cl-muted">
            {t('signed-out-note', { defaultValue: 'Runs, scores and achievements need an account. The training duel does not.' })}
          </p>
        )}
        <label className="flex items-center gap-2 text-[0.75rem] cl-muted min-h-11 cursor-pointer w-fit">
          <input type="checkbox" checked={minigames} onChange={(e) => onMinigames(e.target.checked)} className="w-4 h-4" style={{ accentColor: '#b6ff3c' }} />
          {t('minigames-setting', { defaultValue: 'Clash minigames (off: clashes resolve as rolled)' })}
        </label>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Leaderboard />
      </div>
    </div>
  );
}
