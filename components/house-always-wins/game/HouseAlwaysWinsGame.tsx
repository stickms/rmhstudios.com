"use client";

import { useGameSession } from "@/hooks/useGameSession";
import { useRef, useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GameEngine, type StoreAccess } from "@/lib/house-always-wins/engine/GameEngine";
import { IntroScene } from "@/lib/house-always-wins/scenes/IntroScene";
import { WorldScene } from "@/lib/house-always-wins/scenes/WorldScene";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { MusicManager } from "@/lib/house-always-wins/music";
import { CANVAS_W, CANVAS_H } from "@/lib/house-always-wins/constants";
import type { DialogueData } from "@/lib/house-always-wins/types";
import { HUD } from "./HUD";
import { DialogBox } from "./DialogBox";
import { MenuOverlay } from "./MenuOverlay";
import { MainMenu } from "./MainMenu";
import { Toasts, type ToastItem } from "./Toasts";
import { EndingOverlay } from "./EndingOverlay";
import { PokerGame } from "./PokerGame";
import { TouchPad } from "./TouchPad";

export function HouseAlwaysWinsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // The game opens on its main menu. The engine is built on mount but only
  // started by the first Play/Continue (so the intro and music begin on a click).
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const startedRef = useRef(false);
  const introSeen = useHouseAlwaysWinsStore((s) => s.introSeen);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ending, setEnding] = useState<string | null>(null);
  const [pokerOpen, setPokerOpen] = useState(false);
  // The letterbox around the stage. The touch pad lives THERE, not on the stage:
  // in portrait the 400x256 stage is a ~260px strip and thumbs + buttons covered half of it.
  const [padHost, setPadHost] = useState<HTMLElement | null>(null);
  const toastId = useRef(0);
  const inHost = (node: ReactNode) => (padHost ? createPortal(node, padHost) : node);
  const menuOpenRef = useRef(false);

  const handleChoice = useCallback((action: string) => {
    const scene = engineRef.current?.getCurrentScene();
    scene?.handleDialogueChoice(action);
    setDialogue(null);
  }, []);

  const handleAdvance = useCallback(() => {}, []);

  // M toggles the pause menu (not while a dialogue, poker hand or ending is up).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "KeyM" && screen === "game" && !dialogue && !ending && !pokerOpen) {
        e.preventDefault();
        setMenuOpen((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, dialogue, ending, pokerOpen]);

  useEffect(() => {
    setPadHost(canvasRef.current?.closest<HTMLElement>(".app-stage-fit") ?? null);
  }, []);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  // Session contract: screen on while playing; hiding the tab opens the pause
  // menu (unless a dialogue, poker hand or ending already owns the screen).
  useGameSession({
    id: "house-always-wins",
    active: screen === "game" && !ending,
    onPause: () => {
      if (screen === "game" && !dialogue && !pokerOpen) setMenuOpen(true);
    },
  });

  // Pause the platformer whenever a React overlay owns the screen.
  useEffect(() => {
    engineRef.current?.setPaused(screen === "menu" || menuOpen || pokerOpen || !!ending);
  }, [screen, menuOpen, pokerOpen, ending]);

  // Play / Continue from the main menu: start the engine the first time (through
  // the existing intro-or-world logic), otherwise just resume the paused run.
  const handlePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!startedRef.current) {
      startedRef.current = true;
      const get = useHouseAlwaysWinsStore.getState;
      const seen = get().introSeen;
      if (!seen) get().setIntroSeen(true);
      engine.start(seen ? "world" : "intro");
    }
    setMenuOpen(false);
    setScreen("game");
  }, []);

  // Pause menu -> main menu. The save persists as always; the live run is kept
  // paused underneath so Continue picks up exactly where the player left off.
  const handleMainMenu = useCallback(() => {
    setMenuOpen(false);
    setScreen("menu");
  }, []);

  const closePoker = useCallback(() => {
    setPokerOpen(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const get = useHouseAlwaysWinsStore.getState;
    const store: StoreAccess = {
      getDebt: () => get().debt,
      addDebt: (n) => get().addDebt(n),
      payDebt: (n) => get().payDebt(n),
      getChips: () => get().chips,
      addChips: (n) => get().addChips(n),
      spendChips: (n) => get().spendChips(n),
      getKeys: () => get().keys,
      addKey: () => get().addKey(),
      hasAbility: (id) => get().hasAbility(id),
      grantAbility: (id) => get().grantAbility(id),
      getFlag: (k) => get().getFlag(k),
      setFlag: (k, v) => get().setFlag(k, v),
      markVisited: (r) => get().markVisited(r),
      getCheckpoint: () => ({ room: get().checkpointRoom, id: get().checkpointId }),
      setCheckpoint: (r, id) => get().setCheckpoint(r, id),
      registerDeath: () => get().registerDeath(),
      getQuestState: () => get().getQuestState(),
    };

    const engine = new GameEngine(canvas, store);
    engine.onDialogueChange = setDialogue;
    engine.onPromptChange = setPrompt;
    engine.onAreaLabelChange = setAreaLabel;
    engine.onMusicChange = (key) => MusicManager.play(key);
    engine.onEnding = (id) => setEnding(id);
    engine.onOpenPoker = () => setPokerOpen(true);
    engine.onToast = ({ text, color }) => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-3), { id, text, color }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2200);
    };

    engine.registerScene("intro", new IntroScene(engine));
    engine.registerScene("world", new WorldScene(engine));

    engineRef.current = engine;

    return () => {
      engine.stop();
      MusicManager.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    // The stage is the game's own 400×256 in whatever size fits — never a
    // stretch. The previous `width: 1200px; height: 768px; max-*: 100%` gave
    // BOTH axes definite values, which switches `aspect-ratio` off entirely: a
    // 390px-wide phone clamped the width to 390 and left the height at 768, so
    // this pixel art rendered at 0.5:1 instead of 1.5625:1. `.app-stage` states
    // the fit in container units, where there is nothing left to clamp.
    <div className="app-stage" style={{ "--app-stage-ar": `${CANVAS_W} / ${CANVAS_H}` } as CSSProperties}>
      <canvas
        data-jelly-zone="playfield"
        ref={canvasRef}
        className="block h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />

      {screen === "game" && <HUD areaLabel={areaLabel} prompt={prompt} />}

      <Toasts items={toasts} />

      {dialogue && (
        <DialogBox dialogue={dialogue} onChoice={handleChoice} onAdvance={handleAdvance} />
      )}

      {screen === "game" && !menuOpen && !pokerOpen && !ending && !dialogue && (
        <TouchPad host={padHost} onMenu={() => setMenuOpen(true)} />
      )}

      {/* Full-screen panels go in the letterbox, not the stage: in portrait the
          stage is a ~260px strip and the pause menu / poker table were clipped to it. */}
      {inHost(
        <MenuOverlay
          open={menuOpen && screen === "game"}
          onClose={() => setMenuOpen(false)}
          onMainMenu={handleMainMenu}
        />,
      )}

      {screen === "menu" && padHost && createPortal(<MainMenu hasSave={introSeen} onPlay={handlePlay} />, padHost)}

      {pokerOpen && inHost(<PokerGame onClose={closePoker} />)}

      {ending && inHost(<EndingOverlay endingId={ending} />)}
    </div>
  );
}
