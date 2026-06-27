"use client";

import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";

interface EndingDef {
  title: string;
  body: string;
  accent: string;
}

const ENDINGS: Record<string, EndingDef> = {
  settled: {
    title: "PAID IN FULL",
    body: "You slide every chip across the felt. The House counts them twice, then thrice, then — finds nothing left to hold over you. The gold mask tilts. For the first time the doors open outward. You walk into a morning you weren't sure existed. Free. Actually free.",
    accent: "#5fd2a0",
  },
  gamble_win: {
    title: "DOUBLE — AND NOTHING",
    body: "One cut of the deck. Your hand trembles; the House's does not. You flip it: the impossible card. The debt evaporates, the mask cracks down the middle, and the whole Mirage Royale exhales like a held breath. You beat the House at its own game. Nobody will believe you. That's fine.",
    accent: "#f0c674",
  },
  gamble_lose: {
    title: "THE HOUSE ALWAYS WINS",
    body: "One cut of the deck. You should have known better — everyone here knew better, once. The card turns. Wrong. The lights dim to amber, the carpet swallows your footsteps, and somewhere a coin is already spinning for the next you. Heads you wake. Tails you remember.",
    accent: "#c0392b",
  },
  refuse: {
    title: "WALK AWAY",
    body: "You don't play. You don't pay. You just turn your back on the gold mask and walk — past the felt, past the reels, past every version of yourself still seated at the tables. The debt follows you out the door like a shadow. But it follows. It doesn't lead. Some nights, that's the whole victory.",
    accent: "#9b6cf0",
  },
};

export function EndingOverlay({ endingId }: { endingId: string }) {
  const resetRun = useHouseAlwaysWinsStore((s) => s.resetRun);
  const deaths = useHouseAlwaysWinsStore((s) => s.deaths);
  const def = ENDINGS[endingId] ?? ENDINGS.refuse;

  const playAgain = () => {
    resetRun();
    window.location.reload();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/92 backdrop-blur-sm">
      <div className="max-w-lg px-8 text-center">
        <div
          className="mb-3 font-mono text-xs tracking-[0.4em] uppercase"
          style={{ color: def.accent }}
        >
          The House Always Wins
        </div>
        <h1
          className="mb-6 text-3xl font-bold tracking-tight"
          style={{ color: def.accent }}
        >
          {def.title}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-[#cabba0]">{def.body}</p>
        <div className="mb-6 font-mono text-[11px] tracking-widest text-[#6b6155]">
          RUN COMPLETE · {deaths} BUST{deaths === 1 ? "" : "S"}
        </div>
        <button
          onClick={playAgain}
          className="rounded-lg border border-[#d4a054]/40 bg-[#d4a054]/10 px-6 py-2.5 font-mono text-sm tracking-wide text-[#f0c674] transition-colors hover:bg-[#d4a054]/20"
        >
          Spin Again
        </button>
      </div>
    </div>
  );
}
