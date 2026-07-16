'use client';

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useMultiplayerSync } from '@/lib/kowloon-knockout/useMultiplayerSync';
import MainMenu from '@/components/kowloon-knockout/MainMenu';
import CharacterSelect from '@/components/kowloon-knockout/CharacterSelect';
import MultiplayerLobby from '@/components/kowloon-knockout/MultiplayerLobby';
import ResultScreen from '@/components/kowloon-knockout/ResultScreen';
import { AnimatePresence, m as motion } from 'framer-motion';
import './kowloon-knockout.css';

const GameView = lazy(() => import('@/components/kowloon-knockout/arena/GameView'));

export default function KowloonKnockout() {
  const { t } = useTranslation("c-kowloon-knockout");
  const { phase } = useGameStore();
  useMultiplayerSync();

  return (
    <div className="kowloon-knockout">
      <div className="app-container">
        <AnimatePresence mode="wait">
          {phase === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ width: '100%', height: '100%' }}
            >
              <MainMenu />
            </motion.div>
          )}

          {phase === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
              style={{ width: '100%', height: '100%' }}
            >
              <CharacterSelect />
            </motion.div>
          )}

          {phase === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
              style={{ width: '100%', height: '100%' }}
            >
              <MultiplayerLobby />
            </motion.div>
          )}

          {(phase === 'fight' || phase === 'countdown') && (
            <motion.div
              key="fight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%' }}
            >
              <Suspense fallback={
                <div style={{ color: '#ffcc00', fontSize: '12px', display: 'grid', placeItems: 'center', height: '100%' }}>
                  {t("loading", { defaultValue: "LOADING..." })}
                </div>
              }>
                <GameView />
              </Suspense>
            </motion.div>
          )}

          {phase === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={{ width: '100%', height: '100%' }}
            >
              <ResultScreen />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
