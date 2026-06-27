"use client";

import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { currentObjective } from "@/lib/house-always-wins/quests";
import { ABILITY_LABEL, type AbilityId } from "@/lib/house-always-wins/types";
import { Coins, KeyRound, TrendingDown, Target } from "lucide-react";

interface HUDProps {
  areaLabel: string;
  prompt: string | null;
}

const ABILITY_KEYS: AbilityId[] = ["doubleJump", "dash", "wallGrip"];
const ABILITY_GLYPH: Record<AbilityId, string> = {
  doubleJump: "⟰",
  dash: "»",
  wallGrip: "⌖",
};

export function HUD({ areaLabel, prompt }: HUDProps) {
  const debt = useHouseAlwaysWinsStore((s) => s.debt);
  const chips = useHouseAlwaysWinsStore((s) => s.chips);
  const keys = useHouseAlwaysWinsStore((s) => s.keys);
  const abilities = useHouseAlwaysWinsStore((s) => s.abilities);
  const flags = useHouseAlwaysWinsStore((s) => s.flags);

  const objective = currentObjective({ debt, chips, keys, abilities, flags });

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-start justify-between px-4 py-3">
        <div>
          <div className="font-mono text-[11px] tracking-[0.25em] text-[#c8b89a] uppercase opacity-70">
            {areaLabel}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {ABILITY_KEYS.map((id) => {
              const has = abilities[id];
              return (
                <span
                  key={id}
                  title={ABILITY_LABEL[id]}
                  className={`flex h-5 items-center gap-1 rounded px-1.5 font-mono text-[10px] tracking-wide transition-colors ${
                    has
                      ? "bg-[#d4a054]/15 text-[#f0c674]"
                      : "bg-white/3 text-[#3a342c]"
                  }`}
                >
                  <span className="text-xs leading-none">{ABILITY_GLYPH[id]}</span>
                  {has && <span className="hidden sm:inline">{ABILITY_LABEL[id]}</span>}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-sm">
          <span className="flex items-center gap-1.5 text-[#5fd2a0]" title="Vault Keys">
            <KeyRound className="h-3.5 w-3.5" />
            <span className="tabular-nums">{keys}/3</span>
          </span>
          <span className="flex items-center gap-1.5 text-[#e7c95a]" title="Chips">
            <Coins className="h-3.5 w-3.5" />
            <span className="tabular-nums">{chips}</span>
          </span>
          <span
            className={`flex items-center gap-1.5 ${debt > 0 ? "text-[#c0392b]" : "text-[#555]"}`}
            title="Debt"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="tabular-nums">{debt}</span>
          </span>
        </div>
      </div>

      {/* Objective ribbon */}
      <div className="pointer-events-none absolute top-16 left-1/2 z-10 -translate-x-1/2">
        <div className="flex max-w-[520px] items-center gap-2 rounded-full border border-[#2a2520]/80 bg-black/55 px-4 py-1.5 backdrop-blur-sm">
          <Target className="h-3.5 w-3.5 shrink-0 text-[#d4a054]" />
          <span className="font-mono text-[11px] leading-tight text-[#cabba0]">
            {objective.text}
          </span>
        </div>
      </div>

      {/* Interact prompt */}
      {prompt && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2">
          <div className="animate-pulse rounded bg-black/70 px-3 py-1 font-mono text-xs tracking-widest text-[#f0c674]">
            {prompt}
          </div>
        </div>
      )}
    </>
  );
}
