'use client';

import { m as motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';
import { makePersonalizer } from '@/lib/versecraft/gen/personalize';
import { ShareSeed } from './ShareSeed';

const REL_LABELS = [
  'Stranger', 'Acquaintance', 'Familiar', 'Friendly', 'Close',
  'Trusted', 'Confidant', 'Bonded', 'Devoted', 'Intimate', 'Soulbound',
];
const REL_MAX = 1800;

export function CastScreen() {
  const world = useGameStore(s => s.world);
  const affinity = useGameStore(s => s.affinity);
  const settings = useGameStore(s => s.settings);
  const goBack = useGameStore(s => s.goBack);
  const setScreen = useGameStore(s => s.setScreen);
  const personalize = makePersonalizer(settings.playerName, settings.playerPronouns, settings.customPronouns);

  if (!world) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4 px-4 text-center">
        <p style={{ color: '#a89888' }}>No story in progress yet.</p>
        <button onClick={() => setScreen('world_setup')} className="px-5 py-2.5 rounded"
          style={{ backgroundColor: 'rgba(196,163,90,0.2)', border: '1px solid rgba(196,163,90,0.5)', color: '#e8e0d0' }}>
          Begin a Verse
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto px-4 py-6 md:py-10" style={{ background: 'radial-gradient(ellipse at top, #241c2e, #13101a 75%)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <button onClick={goBack} className="text-sm px-3 py-2 rounded -ml-1" style={{ color: '#a89888' }}>← Back</button>
          <ShareSeed seed={world.seed} compact />
        </div>
        <h1 className="text-2xl md:text-3xl text-center mb-1" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>
          {world.title}
        </h1>
        <p className="text-center text-sm italic mb-6 px-2" style={{ color: '#a89888' }}>{personalize(world.premise)}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {world.characters.map((c, i) => {
            const a = affinity[c.id];
            const lvl = a?.level ?? 0;
            const pts = a?.affinity ?? 0;
            const pct = Math.min(100, Math.round((pts / REL_MAX) * 100));
            const sprite = spriteUrl(c.packId, 'happy') ?? spriteUrl(c.packId, 'neutral');
            return (
              <motion.div
                key={c.id}
                className="flex gap-3 rounded-xl p-3 overflow-hidden"
                style={{ backgroundColor: 'rgba(26,21,32,0.7)', border: `1px solid ${c.color}40` }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              >
                <div className="flex-shrink-0 w-20 h-24 rounded-lg overflow-hidden flex items-end justify-center"
                  style={{ background: `linear-gradient(160deg, ${c.color}33, transparent)` }}>
                  {sprite && <img src={sprite} alt={c.name} className="h-[120%] object-contain object-bottom"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg font-semibold" style={{ color: c.color, fontFamily: 'var(--font-playfair, serif)' }}>{c.name}</span>
                    <span className="text-xs" style={{ color: '#888' }}>{c.pronouns} · {c.age}</span>
                  </div>
                  <div className="text-xs mb-1.5" style={{ color: '#a89888' }}>{c.archetype} — {c.role}</div>
                  <p className="text-xs leading-snug mb-2 line-clamp-3" style={{ color: '#cbbfae' }}>{c.personality}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                    <span className="text-[11px] whitespace-nowrap" style={{ color: c.accentColor }}>{REL_LABELS[lvl] ?? 'Stranger'}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
