/**
 * LandingScreen.tsx — Signal Forge
 * ─────────────────────────────────
 * The main menu shown when the game launches. Handles authentication,
 * resume/new-game flow, leaderboard display, and the how-to-play button.
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { HowToPlayContent } from './HowToPlayContent';
import { LeaderboardPanel } from './LeaderboardPanel';

interface Props {
  onStartGame: () => void;
  hasSavedRun?: boolean;
  onLoadSavedRun?: () => void;
}

export function LandingScreen({ onStartGame, hasSavedRun, onLoadSavedRun }: Props) {
  const session = authClient.useSession();
  const router = useRouter();
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // If how-to-play is open, render it fullscreen and return (don't render landing screen)
  if (showHowToPlay) {
    return <HowToPlayContent onClose={() => setShowHowToPlay(false)} />;
  }

  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl max-h-full overflow-y-auto">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400 mb-4">
          SIGNAL FORGE
        </h1>
        <p className="text-slate-300 mb-6 leading-relaxed">
          Match waveform sequences to defeat enemies. Manage your tempo, control static corruption, and build a deck powerful enough to survive.
        </p>

        {!session.data ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-red-400 font-mono text-sm uppercase tracking-widest">Authentication Required</p>
            <Button
              onClick={() => router.push('/login')}
              className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-3 rounded-lg"
            >
              Sign In to Play
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-green-400 text-sm font-mono text-center">
              SIGNED IN: {session.data.user.name || (session.data.user as unknown as { username?: string }).username || 'OPERATOR'}
            </div>
            {hasSavedRun ? (
              <>
                <Button
                  onClick={onLoadSavedRun}
                  className="w-full bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-3 rounded-lg border border-green-400 shadow-lg animate-pulse"
                >
                  ▶ Resume Saved Run
                </Button>
                <Button
                  onClick={onStartGame}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-lg border border-slate-600"
                >
                  New Game
                </Button>
              </>
            ) : (
              <Button
                onClick={onStartGame}
                className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg border border-cyan-400 shadow-lg"
              >
                Start Game
              </Button>
            )}
          </div>
        )}

        {/* Leaderboard */}
        <div className="mt-8 border-t border-slate-700 pt-6">
          <LeaderboardPanel inline />
        </div>

        {/* How to Play */}
        <div className="mt-6 border-t border-slate-700 pt-6">
          <Button
            onClick={() => setShowHowToPlay(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-lg border border-slate-600"
          >
            How to Play
          </Button>
        </div>
      </div>
    </div>
  );
}
