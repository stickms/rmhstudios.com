'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/rmhpoetry/store';
import { CHARACTERS } from '@/lib/rmhpoetry/characters';
import { SPRITE_PACKS } from '@/lib/rmhpoetry/sprites';
import type { GenderPresentation, SpritePack } from '@/lib/rmhpoetry/types';

export function SettingsMenu() {
  const settings = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);
  const setScreen = useGameStore(s => s.setScreen);
  const gameStarted = useGameStore(s => s.gameStarted);
  const screen = useGameStore(s => s.screen);

  const [playerName, setPlayerName] = useState(settings.playerName);
  const [pronouns, setPronouns] = useState(settings.playerPronouns);
  const [presentations, setPresentations] = useState(settings.characterPresentations);
  const [spritePack, setSpritePack] = useState<SpritePack>(settings.spritePack);

  const handleApply = () => {
    updateSettings({
      playerName: playerName || 'Ash',
      playerPronouns: pronouns,
      characterPresentations: presentations,
      spritePack,
    });
    if (gameStarted && screen === 'settings') {
      setScreen('dialogue');
    }
  };

  const setCharPresentation = (charId: string, pres: GenderPresentation) => {
    setPresentations(p => ({ ...p, [charId]: pres }));
  };

  const applyPreset = (preset: 'default' | 'all_fem' | 'all_masc') => {
    const newP: Record<string, GenderPresentation> = {};
    for (const id of Object.keys(CHARACTERS)) {
      if (preset === 'all_fem') newP[id] = 'feminine';
      else if (preset === 'all_masc') newP[id] = 'masculine';
      else newP[id] = CHARACTERS[id].defaultPresentation;
    }
    setPresentations(newP);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        className="w-full max-w-lg rounded-lg p-6"
        style={{ backgroundColor: 'rgba(42, 34, 53, 0.9)', border: '1px solid rgba(196, 163, 90, 0.2)' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2
          className="text-2xl mb-6 text-center"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          {gameStarted ? 'Your Poet' : 'Settings'}
        </h2>

        {/* Player Name */}
        <div className="mb-6">
          <label className="block text-sm mb-2" style={{ color: '#a89888' }}>Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Ash"
            maxLength={20}
            className="w-full px-4 py-2 rounded text-base"
            style={{
              backgroundColor: 'rgba(26, 21, 32, 0.8)',
              border: '1px solid rgba(196, 163, 90, 0.3)',
              color: '#e8e0d0',
              outline: 'none',
            }}
          />
        </div>

        {/* Pronouns */}
        <div className="mb-6">
          <label className="block text-sm mb-2" style={{ color: '#a89888' }}>Pronouns</label>
          <div className="flex gap-2 flex-wrap">
            {(['he/him', 'she/her', 'they/them'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPronouns(p)}
                className="px-4 py-1.5 rounded text-sm transition-all"
                style={{
                  backgroundColor: pronouns === p ? 'rgba(196, 163, 90, 0.3)' : 'rgba(26, 21, 32, 0.6)',
                  border: `1px solid ${pronouns === p ? 'rgba(196, 163, 90, 0.6)' : 'rgba(196, 163, 90, 0.15)'}`,
                  color: pronouns === p ? '#c4a35a' : '#a89888',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Sprite Pack */}
        <div className="mb-6">
          <label className="block text-sm mb-2" style={{ color: '#a89888' }}>Sprite Pack</label>
          <div className="flex gap-2 flex-wrap">
            {SPRITE_PACKS.map(pack => (
              <button
                key={pack.id}
                onClick={() => setSpritePack(pack.id)}
                className="flex-1 min-w-30 px-4 py-2 rounded text-left transition-all"
                style={{
                  backgroundColor: spritePack === pack.id ? 'rgba(196, 163, 90, 0.2)' : 'rgba(26, 21, 32, 0.6)',
                  border: `1px solid ${spritePack === pack.id ? 'rgba(196, 163, 90, 0.5)' : 'rgba(196, 163, 90, 0.15)'}`,
                }}
              >
                <div className="text-sm" style={{ color: spritePack === pack.id ? '#c4a35a' : '#a89888' }}>
                  {pack.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#666' }}>
                  {pack.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Character Presentations */}
        <div className="mb-6">
          <label className="block text-sm mb-2" style={{ color: '#a89888' }}>Character Presentation</label>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={() => applyPreset('default')} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'rgba(26, 21, 32, 0.6)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#a89888' }}>
              Default Mix
            </button>
            <button onClick={() => applyPreset('all_fem')} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'rgba(26, 21, 32, 0.6)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#a89888' }}>
              All Feminine
            </button>
            <button onClick={() => applyPreset('all_masc')} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'rgba(26, 21, 32, 0.6)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#a89888' }}>
              All Masculine
            </button>
          </div>

          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {Object.entries(CHARACTERS).map(([id, char]) => (
              <div
                key={id}
                className="flex items-center justify-between px-3 py-2 rounded"
                style={{ backgroundColor: 'rgba(26, 21, 32, 0.5)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: char.color }}
                  />
                  <span className="text-sm">{char.names[presentations[id] || char.defaultPresentation].first} {char.surname}</span>
                </div>
                <div className="flex gap-1">
                  {(['feminine', 'masculine', 'nonbinary'] as const).map(pres => (
                    <button
                      key={pres}
                      onClick={() => setCharPresentation(id, pres)}
                      className="text-xs px-2 py-0.5 rounded transition-all"
                      style={{
                        backgroundColor: (presentations[id] || char.defaultPresentation) === pres
                          ? `${char.color}40`
                          : 'transparent',
                        border: `1px solid ${(presentations[id] || char.defaultPresentation) === pres ? char.color : 'transparent'}`,
                        color: (presentations[id] || char.defaultPresentation) === pres ? '#e8e0d0' : '#666',
                      }}
                    >
                      {pres === 'feminine' ? 'F' : pres === 'masculine' ? 'M' : 'NB'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Apply */}
        <div className="flex gap-3 justify-center">
          {!gameStarted && (
            <button
              onClick={() => setScreen('menu')}
              className="px-6 py-2 rounded transition-all"
              style={{
                backgroundColor: 'rgba(26, 21, 32, 0.8)',
                border: '1px solid rgba(196, 163, 90, 0.2)',
                color: '#a89888',
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={handleApply}
            className="px-8 py-2 rounded text-base font-semibold transition-all"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.25)',
              border: '1px solid rgba(196, 163, 90, 0.5)',
              color: '#c4a35a',
            }}
          >
            {gameStarted ? 'Begin' : 'Apply'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
