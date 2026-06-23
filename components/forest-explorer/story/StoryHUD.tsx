'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { actMaps } from '@/lib/forest-explorer/actMaps';
import { getPuzzlesByAct } from '@/lib/forest-explorer/puzzleDefinitions';

function useObjective(currentAct: string, solvedCount: number, totalPuzzles: number, discoveredEntries: string[], storyFlags: Record<string, boolean>) {
    const { t } = useTranslation("c-forest-explorer");
    return useMemo(() => {
        if (currentAct === 'act1') {
            if (discoveredEntries.length === 0) return t("objective-find-notebook", { defaultValue: "Find the glowing notebook nearby" });
            if (solvedCount === 0) return t("objective-explore-flashlight", { defaultValue: "Explore — your flashlight reveals hidden puzzle stones" });
            if (solvedCount < totalPuzzles - 1) return t("objective-solve-gateway", { solvedCount, totalPuzzles, defaultValue: "Solve puzzles to unlock the gateway ({{solvedCount}}/{{totalPuzzles}})" });
            if (solvedCount === totalPuzzles - 1) return t("objective-ward-seal", { defaultValue: "Find and solve the ward seal at the Gateway Arch" });
            if (storyFlags.act1_gateway_opened) return t("objective-enter-portal-arch", { defaultValue: "Enter the portal at the Gateway Arch" });
            return t("objective-puzzles-solved", { solvedCount, totalPuzzles, defaultValue: "{{solvedCount}}/{{totalPuzzles}} puzzles solved" });
        }
        if (currentAct === 'act2') {
            if (solvedCount < totalPuzzles) return t("objective-calm-forest", { solvedCount, totalPuzzles, defaultValue: "Calm the shifting forest ({{solvedCount}}/{{totalPuzzles}} puzzles)" });
            if (storyFlags.act2_gateway_opened) return t("objective-enter-portal-grove", { defaultValue: "Enter the portal to the Tranquil Grove" });
            return t("objective-puzzles-solved", { solvedCount, totalPuzzles, defaultValue: "{{solvedCount}}/{{totalPuzzles}} puzzles solved" });
        }
        if (currentAct === 'act3') {
            if (solvedCount < totalPuzzles) return t("objective-restore-forest", { solvedCount, totalPuzzles, defaultValue: "Restore the forest ({{solvedCount}}/{{totalPuzzles}} puzzles)" });
            return t("objective-forest-remembers", { defaultValue: "The forest remembers..." });
        }
        return '';
    }, [currentAct, solvedCount, totalPuzzles, discoveredEntries.length, storyFlags, t]);
}

export function StoryHUD() {
    const { t } = useTranslation("c-forest-explorer");
    const currentAct = useStoryStore(s => s.currentAct);
    const flashlightOn = useStoryStore(s => s.flashlightOn);
    const actProgress = useStoryStore(s => s.actProgress);
    const discoveredEntries = useStoryStore(s => s.discoveredEntries);
    const storyFlags = useStoryStore(s => s.storyFlags);

    const actConfig = actMaps[currentAct];
    const puzzles = getPuzzlesByAct(currentAct);
    const solvedCount = actProgress[currentAct].puzzlesSolved.length;
    const objective = useObjective(currentAct, solvedCount, puzzles.length, discoveredEntries, storyFlags);

    return (
        <>
            {/* Act indicator + objective */}
            <div className="absolute top-3 left-14 z-40 flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10">
                    <p className="text-white/70 text-xs font-medium">{actConfig.name}</p>
                    <p className="text-white/40 text-[10px]">
                        {t("puzzles-progress", { solvedCount, total: puzzles.length, defaultValue: "{{solvedCount}}/{{total}} puzzles" })}
                    </p>
                    <p className="text-green-300/50 text-[10px] mt-0.5">{objective}</p>
                </div>
            </div>

            {/* Right side controls */}
            <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
                <span
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-sm transition-colors ${
                        flashlightOn
                            ? 'bg-amber-500/30 border-amber-400/40 text-amber-200'
                            : 'bg-black/50 border-white/10 text-white/40'
                    }`}
                >
                    {flashlightOn ? t("flashlight-on", { defaultValue: "ON" }) : t("flashlight-off", { defaultValue: "OFF" })}
                </span>
            </div>

            {/* Controls hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-widest whitespace-nowrap z-40">
                {t("controls-hint", { defaultValue: "WASD · SHIFT run · SPACE jump · F flashlight · E interact · TAB journal · ESC pause" })}
            </div>

            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <svg width="18" height="18" viewBox="0 0 18 18">
                    <line x1="9" y1="2" x2="9" y2="16" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                    <line x1="2" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1" strokeOpacity="0.45" />
                </svg>
            </div>
        </>
    );
}
