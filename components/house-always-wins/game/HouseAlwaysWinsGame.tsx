"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { GameEngine } from "@/lib/house-always-wins/engine/GameEngine";
import { LobbyScene } from "@/lib/house-always-wins/scenes/LobbyScene";
import { DealerEventScene } from "@/lib/house-always-wins/scenes/DealerEventScene";
import { SecurityEventScene } from "@/lib/house-always-wins/scenes/SecurityEventScene";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { MusicManager } from "@/lib/house-always-wins/music";
import { CANVAS_W, CANVAS_H, RENDER_SCALE } from "@/lib/house-always-wins/constants";
import type { DialogueData } from "@/lib/house-always-wins/types";
import { HUD } from "./HUD";
import { DialogBox } from "./DialogBox";
import { MenuOverlay } from "./MenuOverlay";

export function HouseAlwaysWinsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [dialogue, setDialogue] = useState<DialogueData | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState("The Lobby");
  const [menuOpen, setMenuOpen] = useState(false);

  const storeAddDebt = useHouseAlwaysWinsStore((s) => s.addDebt);
  const storeSetFlag = useHouseAlwaysWinsStore((s) => s.setFlag);

  const handleChoice = useCallback((action: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    const current = engine.getCurrentScene();
    if (current) current.handleDialogueChoice(action);
    setDialogue(null);
  }, []);

  const handleAdvance = useCallback(() => {}, []);

  // M key to toggle menu
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "KeyM" && !dialogue) {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const store = useHouseAlwaysWinsStore.getState;

    const engine = new GameEngine(canvas, {
      getDebt: () => store().debt,
      addDebt: (amount: number) => storeAddDebt(amount),
      getFlags: () => store().flags,
      setFlag: (key: string, value: boolean) => storeSetFlag(key, value),
    });

    engine.onDialogueChange = setDialogue;
    engine.onPromptChange = setPrompt;
    engine.onAreaLabelChange = setAreaLabel;
    engine.onMusicChange = (sceneName: string) => {
      MusicManager.play(sceneName);
    };

    engine.registerScene("lobby", new LobbyScene(engine));
    engine.registerScene("dealerEvent", new DealerEventScene(engine));
    engine.registerScene("securityEvent", new SecurityEventScene(engine));

    engine.start("lobby");
    engineRef.current = engine;

    return () => {
      engine.stop();
      MusicManager.stop();
      engineRef.current = null;
    };
  }, [storeAddDebt, storeSetFlag]);

  const pxW = CANVAS_W * RENDER_SCALE;
  const pxH = CANVAS_H * RENDER_SCALE;

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div className="relative" style={{ width: pxW, height: pxH }}>
        <canvas
          ref={canvasRef}
          className="block"
          style={{
            imageRendering: "pixelated",
            width: pxW,
            height: pxH,
          }}
        />

        <HUD areaLabel={areaLabel} prompt={prompt} />

        {dialogue && (
          <DialogBox
            dialogue={dialogue}
            onChoice={handleChoice}
            onAdvance={handleAdvance}
          />
        )}

        <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </div>
  );
}
