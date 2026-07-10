"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { GameEngine, type StoreAccess } from "@/lib/house-always-wins/engine/GameEngine";
import { IntroScene } from "@/lib/house-always-wins/scenes/IntroScene";
import { WorldScene } from "@/lib/house-always-wins/scenes/WorldScene";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { MusicManager } from "@/lib/house-always-wins/music";
import { CANVAS_W, CANVAS_H, RENDER_SCALE } from "@/lib/house-always-wins/constants";
import type { DialogueData } from "@/lib/house-always-wins/types";
import { HUD } from "./HUD";
import { DialogBox } from "./DialogBox";
import { MenuOverlay } from "./MenuOverlay";
import { Toasts, type ToastItem } from "./Toasts";
import { EndingOverlay } from "./EndingOverlay";
import { PokerGame } from "./PokerGame";

export function HouseAlwaysWinsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ending, setEnding] = useState<string | null>(null);
  const [pokerOpen, setPokerOpen] = useState(false);
  const toastId = useRef(0);
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
      if (e.code === "KeyM" && !dialogue && !ending && !pokerOpen) {
        e.preventDefault();
        setMenuOpen((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogue, ending, pokerOpen]);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  // Pause the platformer whenever a React overlay owns the screen.
  useEffect(() => {
    engineRef.current?.setPaused(menuOpen || pokerOpen || !!ending);
  }, [menuOpen, pokerOpen, ending]);

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

    const introSeen = get().introSeen;
    if (!introSeen) get().setIntroSeen(true);
    engine.start(introSeen ? "world" : "intro");
    engineRef.current = engine;

    return () => {
      engine.stop();
      MusicManager.stop();
      engineRef.current = null;
    };
  }, []);

  const pxW = CANVAS_W * RENDER_SCALE;
  const pxH = CANVAS_H * RENDER_SCALE;

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="relative max-h-full max-w-full"
        style={{ width: pxW, height: pxH, aspectRatio: `${pxW} / ${pxH}` }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />

        <HUD areaLabel={areaLabel} prompt={prompt} />

        <Toasts items={toasts} />

        {dialogue && (
          <DialogBox dialogue={dialogue} onChoice={handleChoice} onAdvance={handleAdvance} />
        )}

        <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

        {pokerOpen && <PokerGame onClose={closePoker} />}

        {ending && <EndingOverlay endingId={ending} />}
      </div>
    </div>
  );
}
