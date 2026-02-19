'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, HelpCircle, ShoppingBag } from 'lucide-react';
import { CursedLogicGame } from '@/components/cursed-logic/CursedLogicGame';
import { HowToPlayModal } from '@/components/cursed-logic/HowToPlayModal';
import { ShopModal } from '@/components/cursed-logic/ShopModal';
import { useShopStore } from '@/lib/cursed-logic/shopState';

export default function CursedLogicPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const fragments = useShopStore((s) => s.fragments);

  return (
    <main className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-hidden">
      <div className="absolute top-3 left-3 z-50">
        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
      </div>

      <div className="text-center pt-3 pb-1 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-cyan-400">
          CURSED LOGIC
        </h1>
        <p className="text-white/50 text-sm mt-1">Duel the Protocol</p>
      </div>

      <div className="flex-grow relative overflow-auto">
        <CursedLogicGame />
      </div>

      {/* Bottom bar: fragments, shop, help — centered and clearly part of the game */}
      <div className="shrink-0 flex justify-center items-center gap-4 py-4 px-4 bg-[#0a0a0f]/95 border-t border-white/10">
        <span className="font-mono text-amber-200 text-lg font-bold px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 shadow-lg">
          {fragments} Fragments
        </span>
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 transition-colors shadow-lg font-mono font-bold text-sm"
          aria-label="Shop"
        >
          <ShoppingBag className="w-6 h-6" />
          Shop
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 border-2 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/25 hover:text-cyan-200 transition-colors shadow-lg font-mono font-bold text-sm"
          aria-label="How to play"
        >
          <HelpCircle className="w-6 h-6" />
          How to play
        </button>
      </div>

      <HowToPlayModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
    </main>
  );
}
