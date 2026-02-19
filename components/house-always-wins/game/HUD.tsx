"use client";

import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";

interface HUDProps {
  areaLabel: string;
  prompt: string | null;
}

export function HUD({ areaLabel, prompt }: HUDProps) {
  const debt = useHouseAlwaysWinsStore((s) => s.debt);

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 pointer-events-none z-10">
        <div className="text-[#c8b89a] text-xs font-mono tracking-[0.2em] uppercase opacity-60">
          {areaLabel}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#8b6914] text-xs font-mono tracking-widest">
            DEBT
          </span>
          <span
            className={`font-mono text-sm font-bold tabular-nums ${
              debt > 0 ? "text-[#c0392b]" : "text-[#555]"
            }`}
          >
            {debt}
          </span>
        </div>
      </div>

      {/* Interact prompt */}
      {prompt && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="text-[#d4a054] text-xs font-mono tracking-widest animate-pulse bg-black/60 px-3 py-1 rounded">
            {prompt}
          </div>
        </div>
      )}
    </>
  );
}
