'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';
import { makePersonalizer } from '@/lib/versecraft/gen/personalize';
import { ShareSeed } from './ShareSeed';

const REL_LABELS = ['Stranger', 'Acquaintance', 'Familiar', 'Friendly', 'Close', 'Trusted', 'Confidant', 'Bonded', 'Devoted', 'Intimate', 'Soulbound'];

export function CompletionScreen() {
  const world = useGameStore(s => s.world);
  const affinity = useGameStore(s => s.affinity);
  const totalPoems = useGameStore(s => s.totalPoemsWritten);
  const settings = useGameStore(s => s.settings);
  const startGeneratedGame = useGameStore(s => s.startGeneratedGame);
  const setScreen = useGameStore(s => s.setScreen);
  const personalize = makePersonalizer(settings.playerName, settings.playerPronouns, settings.customPronouns);

  useEffect(() => { if (!world) setScreen('menu'); }, [world, setScreen]);
  if (!world) return null;

  const closest = [...world.characters]
    .sort((a, b) => (affinity[b.id]?.affinity ?? 0) - (affinity[a.id]?.affinity ?? 0))[0];
  const closestLvl = closest ? (affinity[closest.id]?.level ?? 0) : 0;

  return (
    <div className="min-h-[100dvh] overflow-y-auto flex flex-col items-center justify-center px-4 py-10"
      style={{ background: `radial-gradient(ellipse at center, ${closest?.color ?? '#4A3B6B'}22, #13101a 70%)` }}>
      <motion.div className="w-full max-w-lg text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <div className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: '#c4a35a' }}>Your story ends</div>
        <h1 className="text-3xl md:text-4xl mb-2" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>{world.title}</h1>
        <p className="text-sm italic mb-6" style={{ color: '#a89888' }}>{personalize(world.tagline)}</p>

        {closest && (
          <div className="flex flex-col items-center mb-6">
            <div className="w-28 h-32 rounded-xl overflow-hidden flex items-end justify-center mb-2"
              style={{ background: `linear-gradient(160deg, ${closest.color}40, transparent)` }}>
              {(() => { const s = spriteUrl(closest.packId, 'happy'); return s
                ? <img src={s} alt={closest.name} className="h-[120%] object-contain object-bottom" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : null; })()}
            </div>
            <p className="text-sm" style={{ color: '#cbbfae' }}>
              You grew closest to <span style={{ color: closest.color, fontWeight: 600 }}>{closest.name}</span>
              {' '}— {REL_LABELS[closestLvl] ?? 'Familiar'}.
            </p>
          </div>
        )}

        <div className="text-xs mb-6" style={{ color: '#888' }}>
          {world.routePlan.totalChapters} chapters · {totalPoems} poem{totalPoems === 1 ? '' : 's'} written
        </div>

        <div className="flex flex-col items-center gap-2 mb-6">
          <span className="text-xs" style={{ color: '#a89888' }}>Share this version</span>
          <ShareSeed seed={world.seed} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => startGeneratedGame({ seed: world.seed })}
            className="px-5 py-3 rounded text-base active:scale-95 transition-transform"
            style={{ backgroundColor: 'rgba(42,34,53,0.7)', border: '1px solid rgba(196,163,90,0.25)', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' }}>
            ↻ Replay this version
          </button>
          <button onClick={() => setScreen('world_setup')}
            className="px-5 py-3 rounded text-base active:scale-95 transition-transform"
            style={{ backgroundColor: 'rgba(196,163,90,0.22)', border: '1px solid rgba(196,163,90,0.5)', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' }}>
            ✦ New story
          </button>
        </div>
        <button onClick={() => setScreen('menu')} className="mt-5 text-xs" style={{ color: '#777' }}>← Main menu</button>
      </motion.div>
    </div>
  );
}
