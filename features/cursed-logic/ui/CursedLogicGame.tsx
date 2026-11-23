import { useTranslation } from 'react-i18next';
import './cursed-logic.css';

/**
 * The game: picks the screen (boot menu, training duel, a run's duel, between duels, the run summary), plays the
 * reveal sequence on timers, maps the keyboard, and plays the terminal's sounds. Rules live in `engine/`.
 */
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session/session-context';
import { useGameSession } from '@/hooks/useGameSession';
import { useCursedLogicStore } from '@features/cursed-logic/engine/gameState';
import { currentStep, readTutorialDone } from '@features/cursed-logic/engine/tutorial';
import { PLAYER_ACTIONS, type PlayerAction } from '@features/cursed-logic/engine/types';
import * as sounds from '@features/cursed-logic/engine/sounds';
import { useCopy } from './copy';
import { Backdrop } from './Backdrop';
import { Menu } from './Menu';
import { DuelView, ACTION_KEYS } from './DuelView';
import { BetweenDuels } from './BetweenDuels';
import { RunSummary } from './RunSummary';
import { TutorialCoach } from './TutorialCoach';
import { MinigameOverlay } from './MinigameOverlay';

/** Reveal pacing: the Protocol's action flips, then yours, then the result holds. */
const REVEAL_STEP_MS = 520;
const RESULT_MS = 1000;
const RESULT_END_MS = 1500;

export function CursedLogicGame({ onHelp }: { onHelp: () => void }) {
  const store = useCursedLogicStore();
  const copy = useCopy();
  const { t } = useTranslation('c-cursed-logic');
  const session = useSession();
  const signedIn = !!session.data;
  const [tutorialDone, setTutorialDone] = useState(false);
  const { screen, run, phase, revealStep, pending, clashId } = store;

  useGameSession({ id: 'cursed-logic', active: screen !== 'menu' && run?.stage !== 'over' });

  useEffect(() => {
    store.init();
    setTutorialDone(readTutorialDone());
    // Init once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen === 'menu') setTutorialDone(readTutorialDone());
  }, [screen]);

  // The reveal sequence.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const id = setTimeout(() => useCursedLogicStore.getState().advanceReveal(), REVEAL_STEP_MS);
    return () => clearTimeout(id);
  }, [phase, revealStep]);

  useEffect(() => {
    if (phase !== 'result') return;
    const ended = !!run?.duel?.result;
    const id = setTimeout(() => useCursedLogicStore.getState().endResult(), ended ? RESULT_END_MS : RESULT_MS);
    return () => clearTimeout(id);
  }, [phase, clashId, run?.duel?.result]);

  // Sounds: the flip, then the outcome.
  useEffect(() => {
    if (phase === 'reveal' && revealStep === 0) sounds.revealTick(false);
    if (phase === 'reveal' && revealStep === 1) sounds.revealTick(true);
  }, [phase, revealStep]);

  useEffect(() => {
    if (phase !== 'result' || !run?.duel) return;
    const last = run.duel.log[0];
    if (!last) return;
    if (run.duel.result === 'win') sounds.terminate();
    else if (run.duel.result === 'lose') sounds.gameLose();
    else if (last.protocolDamage > 0 && last.playerDamage === 0) sounds.hitFoe();
    else if (last.playerDamage > 0) sounds.hitYou();
    else if (last.playerAction === 'Block' || last.protocolAction === 'Block') sounds.shieldBlock(true);
    else sounds.revealTick(true);
    // Once per clash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clashId]);

  useEffect(() => {
    if (run?.mode === 'run' && run.stage === 'over' && run.victory) sounds.gameWin();
  }, [run?.mode, run?.stage, run?.victory]);

  // Keyboard: 1-3 stance, A/S/D/F commands, R reinforce.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const s = useCursedLogicStore.getState();
      const duel = s.run?.duel;
      if (!duel || s.phase !== 'idle' || s.run?.stage !== 'duel') return;
      const k = e.key.toUpperCase();
      if (!duel.stance && ['1', '2', '3'].includes(k)) {
        const stance = duel.stanceOffer[Number(k) - 1];
        if (stance) {
          e.preventDefault();
          s.chooseStance(stance);
        }
        return;
      }
      if (duel.stance) {
        const action = PLAYER_ACTIONS.find((a: PlayerAction) => ACTION_KEYS[a] === k);
        if (action) {
          e.preventDefault();
          s.commit(action);
        } else if (k === 'R' && s.screen === 'run') {
          e.preventDefault();
          s.setReinforce(!s.reinforce);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const coach = screen === 'tutorial' ? currentStep(store.tutorial) : null;
  // The duel stays on screen through its last result (the kill effect) before the next screen takes over.
  const showDuel = !!run?.duel && (screen === 'tutorial' || run.stage === 'duel' || phase === 'result');

  let body: React.ReactNode;
  if (screen === 'menu' || !run) {
    body = (
      <Menu
        copy={copy}
        signedIn={signedIn}
        sessionPending={session.isPending}
        tutorialDone={tutorialDone}
        minigames={store.settings.minigames}
        onStart={store.startRun}
        onResume={store.resumeRun}
        onTutorial={store.startTutorial}
        onHelp={onHelp}
        onMinigames={store.setMinigames}
      />
    );
  } else if (showDuel) {
    body = (
      <>
        {screen === 'tutorial' && (
          <TutorialCoach tutorial={store.tutorial} onContinue={store.tutorialContinue} onSkip={store.finishTutorial} />
        )}
        <DuelView run={run} store={store} copy={copy} coach={coach} />
        {screen === 'run' && (
          <div className="w-full max-w-[760px] mx-auto px-4 pb-6">
            <button type="button" className="cl-link text-[0.72rem]" onClick={store.abandon}>
              {t('abandon', { defaultValue: 'Abandon run' })}
            </button>
          </div>
        )}
      </>
    );
  } else if (run.stage === 'over') {
    body = (
      <RunSummary
        run={run}
        copy={copy}
        signedIn={signedIn}
        startedAt={store.startedAt}
        onAgain={() => store.startRun(run.pacts)}
        onMenu={store.toMenu}
      />
    );
  } else {
    body = <BetweenDuels run={run} store={store} copy={copy} />;
  }

  return (
    <div className="relative min-h-full">
      <Backdrop sector={run?.sector ?? 1} />
      <div className="relative">{body}</div>
      {phase === 'minigame' && pending?.minigame && (
        <MinigameOverlay
          kind={pending.minigame.kind}
          chaosDistort={pending.minigame.chaosDistort}
          onComplete={(success) => store.completeMinigame(success)}
        />
      )}
    </div>
  );
}
