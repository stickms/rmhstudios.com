/**
 * Signal Forge's orchestrator: owns the run, the progression (`SaveMeta`), the cloud save, the tutorial and the
 * end-of-run submission, and picks the screen. All rules live in the engine (`dispatch`); this file only wires
 * state, persistence and the screens together.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/session/session-context';
import { readJson, readString, writeString } from '@/lib/core/persist';
import { useGameSession } from '@/hooks/useGameSession';
import { dispatch, finalScore, floorOf, isOver, newRun, type Action } from '@features/signal-forge/engine/run';
import { seedFrom } from '@features/signal-forge/engine/rng';
import { metaAfterRun, readMeta, type SaveMeta } from '@features/signal-forge/engine/save';
import { abandonRun, loadSave, saveRun, submitScore } from '@features/signal-forge/engine/persistence';
import { startTutorial, tutorialAdvance, tutorialAllows, tutorialRun, currentStep, TUTORIAL_STORAGE_KEY, type TutorialEvent, type TutorialState } from '@features/signal-forge/engine/tutorial';
import type { RhythmMode, RunState } from '@features/signal-forge/engine/types';
import { Backdrop } from './art/Backdrop';
import { CombatScreen } from './CombatScreen';
import { EndScreen, type SubmitStatus } from './EndScreen';
import { MapScreen } from './MapScreen';
import { Menu } from './Menu';
import { CodexModal, DeckModal, HelpModal, Modal } from './Modals';
import { RunHud } from './RunHud';
import { EventScreen, PickScreen, RestScreen, RewardScreen, ShopScreen, TreasureScreen } from './Screens';
import { TutorialCoach } from './TutorialCoach';
import { isMuted, setMuted } from './audio';

type Screen = 'menu' | 'run' | 'tutorial';
type Overlay = null | 'help' | 'deck' | 'codex' | 'pause';

const MODE_KEY = 'rmh:signal-forge:mode';
const META_KEY = 'rmh:signal-forge:meta';

const readLocal = (key: string): string | null => readString(key);
const writeLocal = (key: string, v: string): void => {
  writeString(key, v);
};

function defaultMode(): RhythmMode {
  const saved = readLocal(MODE_KEY);
  if (saved === 'timed' || saved === 'steady') return saved;
  // Steady unless the player asks for the beat; reduced-motion players never meet the clock by default.
  return 'steady';
}

export function SignalForgeGame() {
  const { t } = useTranslation('c-signal-forge');
  const session = useSession();
  const signedIn = !!session.data;
  const [screen, setScreen] = useState<Screen>('menu');
  const [run, setRun] = useState<RunState | null>(null);
  const [saved, setSaved] = useState<RunState | null>(null);
  const [retired, setRetired] = useState<{ floor: number; score: number } | null>(null);
  const [meta, setMeta] = useState<SaveMeta>(() => {
    const m = readMeta(readJson<unknown>(META_KEY, null));
    if (readLocal(TUTORIAL_STORAGE_KEY) === '1') m.tutorialDone = true;
    return m;
  });
  const [loading, setLoading] = useState(false);
  const [mode, setModeState] = useState<RhythmMode>(defaultMode);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tut, setTut] = useState<TutorialState>(startTutorial);
  const [muted, setMutedState] = useState(isMuted);
  const [submit, setSubmit] = useState<SubmitStatus>('idle');
  const [granted, setGranted] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState<number | null>(null);
  const lastTick = useRef<number>(0);
  const submitted = useRef<number | null>(null);

  const setMode = (m: RhythmMode) => {
    setModeState(m);
    writeLocal(MODE_KEY, m);
  };

  const storeMeta = useCallback((m: SaveMeta) => {
    setMeta(m);
    writeLocal(META_KEY, JSON.stringify(m));
    if (m.tutorialDone) writeLocal(TUTORIAL_STORAGE_KEY, '1');
  }, []);

  // Load the cloud save once signed in.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    setLoading(true);
    void loadSave().then((c) => {
      if (!live) return;
      setLoading(false);
      if (!c) return;
      const merged: SaveMeta = {
        ascensionUnlocked: Math.max(c.meta.ascensionUnlocked, meta.ascensionUnlocked),
        wins: Math.max(c.meta.wins, meta.wins),
        runs: Math.max(c.meta.runs, meta.runs),
        tutorialDone: c.meta.tutorialDone || meta.tutorialDone,
      };
      storeMeta(merged);
      if (c.kind === 'run') setSaved(c.run);
      if (c.kind === 'retired') setRetired({ floor: c.floor, score: c.score });
    });
    return () => {
      live = false;
    };
    // Only on sign-in: `meta` is merged once, later changes are saved by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const act = useCallback((a: Action) => {
    setRun((r) => {
      if (!r) return r;
      const now = performance.now();
      const dt = lastTick.current ? Math.min(60_000, now - lastTick.current) : 0;
      lastTick.current = now;
      const n = dispatch(r, a);
      if (n !== r) n.playMs = r.playMs + dt;
      return n;
    });
  }, []);

  // Autosave on every node change and every new turn.
  const saveKey = run && !run.tutorial ? `${run.act}:${run.row}:${run.phase}:${run.combat?.turn ?? 0}:${run.deck.length}:${run.relics.length}:${run.gold}` : null;
  useEffect(() => {
    if (!run || run.tutorial || !signedIn || isOver(run)) return;
    void saveRun(run, meta);
    // saveKey stands for the parts of the run worth a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey, signedIn]);

  // A finished run: submit once, update progression, clear the save.
  useEffect(() => {
    if (!run || run.tutorial || !isOver(run) || submitted.current === run.seed) return;
    submitted.current = run.seed;
    const nextMeta = metaAfterRun(meta, run);
    setUnlocked(nextMeta.ascensionUnlocked > meta.ascensionUnlocked ? nextMeta.ascensionUnlocked : null);
    storeMeta(nextMeta);
    setSaved(null);
    if (!signedIn) {
      setSubmit('signed-out');
      return;
    }
    setSubmit('sending');
    void saveRun(null, nextMeta);
    void submitScore(finalScore(run), Math.max(1, floorOf(run)), Math.round(run.playMs), {
      won: run.phase === 'victory',
      act: run.act,
      ascension: run.ascension,
      mode: run.mode,
      bursts: run.stats.bursts,
      perfects: run.stats.perfects,
      maxHit: run.stats.maxHit,
      elitesWon: run.stats.elitesWon,
      bossesWon: run.stats.bossesWon,
      deckSize: run.deck.length,
      hpLeft: run.hp,
    }).then((res) => {
      setSubmit(res.ok ? (res.ranked ? 'done' : 'unranked') : 'failed');
      setGranted(res.achievements);
    });
  }, [run, meta, signedIn, storeMeta]);

  const inRun = screen === 'run' && !!run && !isOver(run);
  useGameSession({
    id: 'signal-forge',
    active: inRun && overlay === null,
    onPause: () => setOverlay('pause'),
  });

  const startRun = (ascension: number) => {
    if (!signedIn) return;
    if (saved) void abandonRun();
    const r = newRun({ seed: seedFrom(Date.now()), ascension, mode });
    lastTick.current = performance.now();
    submitted.current = null;
    setSubmit('idle');
    setGranted([]);
    setUnlocked(null);
    setSaved(null);
    setRun(r);
    setScreen('run');
  };

  const continueRun = () => {
    if (!saved) return;
    lastTick.current = performance.now();
    submitted.current = null;
    setRun(saved);
    setScreen('run');
  };

  const toMenu = () => {
    if (run && !run.tutorial && !isOver(run)) setSaved(run);
    setRun(null);
    setOverlay(null);
    setScreen('menu');
  };

  const startTutorialRun = () => {
    setOverlay(null);
    setTut(startTutorial());
    setRun(tutorialRun());
    setScreen('tutorial');
  };

  const finishTutorial = useCallback(() => {
    const m = { ...meta, tutorialDone: true };
    storeMeta(m);
    if (signedIn) void saveRun(saved, m);
    setRun(null);
    setScreen('menu');
  }, [meta, signedIn, saved, storeMeta]);

  const onTutorialEvent = useCallback(
    (ev: TutorialEvent) => {
      if (screen !== 'tutorial') return;
      setTut((s) => {
        const n = tutorialAdvance(s, ev);
        if (n.done) window.setTimeout(finishTutorial, 0);
        return n;
      });
    },
    [screen, finishTutorial],
  );

  const allow = useCallback((ev: TutorialEvent) => (screen === 'tutorial' ? tutorialAllows(tut, ev) : true), [screen, tut]);

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const scene = run ? run.act : 'menu';

  return (
    <div className="sf-root">
      <Backdrop scene={scene} />
      {screen === 'menu' || !run ? (
        <Menu
          signedIn={signedIn}
          loading={loading}
          saved={saved}
          retired={retired}
          meta={meta}
          mode={mode}
          onMode={setMode}
          onContinue={continueRun}
          onNewRun={startRun}
          onTutorial={startTutorialRun}
          onCodex={() => setOverlay('codex')}
          onHelp={() => setOverlay('help')}
          onDismissRetired={() => {
            setRetired(null);
            void abandonRun();
          }}
        />
      ) : (
        <div className="sf-run">
          <RunHud run={run} muted={muted} onToggleSound={toggleSound} onHelp={() => setOverlay('help')} onDeck={() => setOverlay('deck')} onMenu={() => (screen === 'tutorial' ? finishTutorial() : setOverlay('pause'))} />
          <main className="sf-stage" data-jelly-zone="playfield">
            {isOver(run) ? (
              <EndScreen run={run} status={submit} achievements={granted} unlockedAscension={unlocked} onMenu={toMenu} onAgain={() => startRun(Math.min(run.ascension, meta.ascensionUnlocked))} />
            ) : run.phase === 'combat' && run.combat ? (
              <CombatScreen
                key={`${run.act}-${run.row}-${run.seed}`}
                run={run}
                act={act}
                allow={allow}
                onTutorialEvent={onTutorialEvent}
                coach={screen === 'tutorial' ? (currentStep(tut)?.anchor ?? null) : null}
              />
            ) : run.phase === 'map' ? (
              <MapScreen run={run} act={act} />
            ) : run.phase === 'reward' || run.phase === 'boss-reward' ? (
              <RewardScreen run={run} act={act} />
            ) : run.phase === 'shop' ? (
              <ShopScreen run={run} act={act} />
            ) : run.phase === 'rest' ? (
              <RestScreen run={run} act={act} />
            ) : run.phase === 'event' ? (
              <EventScreen run={run} act={act} />
            ) : run.phase === 'pick' ? (
              <PickScreen run={run} act={act} />
            ) : run.phase === 'treasure' ? (
              <TreasureScreen act={act} />
            ) : null}
          </main>
          {screen === 'tutorial' && !tut.done && (
            <TutorialCoach state={tut} onNext={() => onTutorialEvent({ t: 'next' })} onSkip={() => onTutorialEvent({ t: 'skip' })} />
          )}
        </div>
      )}
      {overlay === 'help' && <HelpModal onClose={() => setOverlay(null)} onTutorial={screen === 'run' ? undefined : startTutorialRun} />}
      {overlay === 'codex' && <CodexModal onClose={() => setOverlay(null)} />}
      {overlay === 'deck' && run && <DeckModal deck={run.deck} onClose={() => setOverlay(null)} />}
      {overlay === 'pause' && run && (
        <Modal title={t('pause.title', { defaultValue: 'Paused' })} onClose={() => setOverlay(null)}>
          <div className="sf-pause">
            <button type="button" className="sf-btn sf-btn-hot" onClick={() => setOverlay(null)}>
              {t('pause.resume', { defaultValue: 'Resume' })}
            </button>
            <button type="button" className="sf-btn" onClick={toMenu}>
              {t('pause.save-quit', { defaultValue: 'Save and return to menu' })}
            </button>
            <button
              type="button"
              className="sf-btn sf-btn-ghost"
              onClick={() => {
                void abandonRun();
                setSaved(null);
                setRun(null);
                setOverlay(null);
                setScreen('menu');
              }}
            >
              {t('pause.abandon', { defaultValue: 'Abandon run' })}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

