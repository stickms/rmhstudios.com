'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { getAllSaves, formatPlaytime, formatTimestamp, deleteSave } from '@/lib/versecraft/persistence';
import type { SaveFile } from '@/lib/versecraft/types';

export function SaveLoadMenu({ mode }: { mode: 'save' | 'load' }) {
  const saveToSlot = useGameStore(s => s.saveToSlot);
  const loadFromSlot = useGameStore(s => s.loadFromSlot);
  const goBack = useGameStore(s => s.goBack);
  const [saves, setSaves] = useState<(SaveFile | null)[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSaves(getAllSaves());
  }, []);

  const handleSlotClick = (slotId: number) => {
    if (mode === 'save') {
      const success = saveToSlot(slotId);
      if (success) {
        setMessage(`Saved to slot ${slotId}`);
        setSaves(getAllSaves());
        setTimeout(() => setMessage(''), 2000);
      }
    } else {
      const success = loadFromSlot(slotId);
      if (!success) {
        setMessage('No save in this slot');
        setTimeout(() => setMessage(''), 2000);
      }
    }
  };

  const handleDelete = (slotId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSave(slotId);
    setSaves(getAllSaves());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        className="max-w-md w-full rounded-lg p-6"
        style={{
          backgroundColor: 'rgba(42, 34, 53, 0.9)',
          border: '1px solid rgba(196, 163, 90, 0.25)',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-xl"
            style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
          >
            {mode === 'save' ? 'Save Game' : 'Load Game'}
          </h2>
          <button
            onClick={goBack}
            className="text-sm px-3 py-1 rounded"
            style={{
              backgroundColor: 'rgba(26, 21, 32, 0.6)',
              border: '1px solid rgba(196, 163, 90, 0.15)',
              color: '#a89888',
            }}
          >
            Back
          </button>
        </div>

        {/* Message */}
        {message && (
          <motion.p
            className="text-center text-sm mb-3"
            style={{ color: '#c4a35a' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {message}
          </motion.p>
        )}

        {/* Save slots */}
        <div className="space-y-2">
          {saves.map((save, i) => (
            <button
              key={i}
              onClick={() => handleSlotClick(i)}
              className="w-full flex items-center justify-between px-4 py-3 rounded transition-all text-left"
              style={{
                backgroundColor: save ? 'rgba(42, 34, 53, 0.6)' : 'rgba(26, 21, 32, 0.4)',
                border: `1px solid ${save ? 'rgba(196, 163, 90, 0.2)' : 'rgba(196, 163, 90, 0.08)'}`,
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#666' }}>
                    {i === 0 ? 'Auto' : `Slot ${i}`}
                  </span>
                  {save && (
                    <span className="text-xs" style={{ color: '#a89888' }}>
                      {save.playerName}
                    </span>
                  )}
                </div>
                {save ? (
                  <div className="text-xs mt-1" style={{ color: '#555' }}>
                    {save.chapterTitle} | {formatPlaytime(save.playtime)} | {formatTimestamp(save.timestamp)}
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: '#444' }}>Empty</span>
                )}
              </div>
              {save && mode === 'save' && i !== 0 && (
                <button
                  onClick={(e) => handleDelete(i, e)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#d9534f', backgroundColor: 'rgba(217, 83, 79, 0.1)' }}
                >
                  Del
                </button>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
