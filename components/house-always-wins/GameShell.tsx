"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";

const HouseAlwaysWinsGame = dynamic(
  () =>
    import("./game/HouseAlwaysWinsGame").then((m) => ({
      default: m.HouseAlwaysWinsGame,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
          LOADING...
        </div>
      </div>
    ),
  }
);

interface GameShellProps {
  userName?: string | null;
}

export function GameShell({ userName }: GameShellProps) {
  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-neutral-800/50 z-20">
        <Link
          href="/"
          className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono tracking-widest text-xs">RMH STUDIOS</span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="text-neutral-600 text-[10px] font-mono tracking-wide hidden sm:block">
            WASD/Arrows &bull; Space Jump &bull; E Interact &bull; M Menu
          </span>
          {userName && (
            <span className="text-neutral-600 text-xs font-mono">
              {userName}
            </span>
          )}
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        <HouseAlwaysWinsGame />
      </div>
    </div>
  );
}
