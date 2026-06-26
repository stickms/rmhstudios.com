'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';
import type { Emotion } from '@/lib/versecraft/gen/world-types';

const MAX_WORDS = 6;

/**
 * A lightweight poem-composition beat: the player picks words from a themed pool
 * to write a few lines for a character, which scores and grants affinity. Reuses
 * the existing word database; fully self-contained so it can't break the story.
 */
export function GeneratedPoemMoment() {
  const poem = useGameStore(s => s.currentGenPoem);
  const world = useGameStore(s => s.world);
  const finishGenPoem = useGameStore(s => s.finishGenPoem);
  const advanceGeneratedChapter = useGameStore(s => s.advanceGeneratedChapter);

  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; reaction: string } | null>(null);

  if (!poem) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <button className="px-5 py-2 rounded" style={{ color: '#c4a35a' }} onClick={() => void advanceGeneratedChapter()}>
          Continue →
        </button>
      </div>
    );
  }

  const character = world?.characters.find(c => c.id === poem.characterId);
  const accent = character?.color ?? '#c4a35a';
  const emotion: Emotion = result ? (result.score >= 68 ? 'happy' : 'thoughtful') : 'neutral';
  const sprite = character ? spriteUrl(character.packId, emotion) : null;

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id)
      : prev.length >= MAX_WORDS ? prev : [...prev, id]);
  };

  const composedText = selected
    .map(id => poem.words.find(w => w.id === id)?.text)
    .filter(Boolean)
    .join(' ');

  const submit = () => {
    if (selected.length < 2) return;
    setResult(finishGenPoem(selected));
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col items-center px-4 py-10 overflow-y-auto"
      style={{ background: `radial-gradient(ellipse at top, ${accent}18, #13101a 70%)` }}>
      <div className="w-full max-w-2xl">
        {sprite && (
          <div className="flex justify-center mb-2">
            <img src={sprite} alt="" className="h-40 object-contain" loading="eager"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <h2 className="text-center text-2xl mb-1" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>
          A Poem
        </h2>
        <p className="text-center text-sm italic mb-6" style={{ color: '#a89888' }}>{poem.prompt}</p>

        {/* Composed line */}
        <div className="min-h-[3.5rem] rounded-lg px-4 py-3 mb-4 flex items-center justify-center text-center"
          style={{ backgroundColor: 'rgba(26,21,32,0.7)', border: `1px solid ${accent}40`, fontFamily: 'var(--font-eb-garamond, serif)', color: '#e8e0d0', fontSize: '1.25rem', fontStyle: 'italic' }}>
          {composedText || <span style={{ color: '#666' }}>pick {2}–{MAX_WORDS} words…</span>}
        </div>

        {!result && (
          <>
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {poem.words.map(w => {
                const on = selected.includes(w.id);
                return (
                  <button key={w.id} onClick={() => toggle(w.id)}
                    className="px-3.5 py-2 rounded text-sm transition-all active:scale-95"
                    style={{ minHeight: 40,
                      backgroundColor: on ? `${accent}30` : 'rgba(42,34,53,0.6)',
                      border: `1px solid ${on ? accent : 'rgba(196,163,90,0.15)'}`,
                      color: on ? '#fff' : '#cbbfae',
                    }}>
                    {w.text}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center gap-3">
              <button onClick={() => setSelected([])} className="px-4 py-2 rounded text-sm"
                style={{ color: '#888', border: '1px solid rgba(196,163,90,0.15)' }}>Clear</button>
              <button onClick={submit} disabled={selected.length < 2}
                className="px-6 py-2 rounded text-sm tracking-wide"
                style={{ backgroundColor: selected.length >= 2 ? `${accent}30` : 'rgba(42,34,53,0.4)', border: `1px solid ${accent}66`, color: selected.length >= 2 ? '#fff' : '#666', fontFamily: 'var(--font-playfair, serif)' }}>
                Give it to {poem.characterName}
              </button>
            </div>
          </>
        )}

        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-2">
              <div className="text-sm mb-3" style={{ color: accent }}>
                {result.score >= 85 ? 'It lands perfectly.' : result.score >= 68 ? 'It resonates.' : 'It connects.'} (+{Math.round(result.score / 12)} closeness)
              </div>
              <p className="text-base italic mb-6" style={{ color: '#e8e0d0', fontFamily: 'var(--font-nunito, sans-serif)' }}>{result.reaction}</p>
              <button onClick={() => void advanceGeneratedChapter()}
                className="px-6 py-2.5 rounded tracking-wide"
                style={{ backgroundColor: `${accent}30`, border: `1px solid ${accent}66`, color: '#fff', fontFamily: 'var(--font-playfair, serif)' }}>
                Continue →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
