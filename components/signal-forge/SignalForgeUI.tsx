'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import type { Card, Enemy, Relic } from '@/lib/signal-forge';

interface ShopItem {
  id: string;
  type: 'card' | 'relic' | 'removal';
  item: Card | Relic | null;
  price: number;
}

interface GameState {
  floor: number;
  node: number;
  phase: string;
  deckList: Card[];
  deck: Card[];
  hand: Card[];
  discard: Card[];
  playedThisTurn: Card[];
  playerHp: number;
  playerMaxHp: number;
  playerShield: number;
  playerEnergy: number;
  playerTempo: number;
  playerStatic: number;
  score: number;
  currency: number;
  enemies: Enemy[];
  targetSequence: string[];
  currentSequence: string[];
  turn: number;
  gameOver: boolean;
  selectedEnemyId: number;
  shopInventory: ShopItem[];
  ownedRelics: Relic[];
  // Ability tracking
  glitchThreshold: number;
  firstPulsePlayedThisTurn: boolean;
  firstSawPlayedThisTurn: boolean;
  combatLog: string[];
}

interface SignalForgeUIProps {
  gameState: GameState;
  onPlayCard: (index: number) => void;
  onUnplayCard: (index: number) => void;
  onEndTurn: () => void;
  onStartGame: () => void;
  onNextFloor: () => void;
  onSelectEnemy: (enemyId: number) => void;
  onBuyItem?: (itemId: string) => void;
  onRemoveCard?: (cardId: number) => void;
  onProceedFromShop?: () => void;
  onReturnToLanding?: () => void;
  hasSavedRun?: boolean;
  onLoadSavedRun?: () => void;
  onAbandonRun?: () => void;
  showPauseMenu?: boolean;
  setShowPauseMenu?: (v: boolean) => void;
}

/** Build a structured list of keyword/ability tags for a card */
function cardKeywordTags(card: Card): string[] {
  const tags: string[] = [];
  if (card.echo) tags.push('Echo');
  if (card.aoe) tags.push('AOE');
  if (card.exhaust) tags.push('Exhaust');
  if (card.sustain) tags.push('Sustain');
  if (card.wildcard) tags.push('Wildcard');
  if (card.isGlitch) tags.push('Glitch');
  if (card.leech) tags.push('Leech');
  if (card.stabilize) tags.push('Stabilize');
  return tags;
}

/** Keyword badge color lookup */
function keywordColor(kw: string): string {
  const map: Record<string, string> = {
    Echo: 'bg-purple-700 text-purple-200',
    AOE: 'bg-orange-700 text-orange-200',
    Exhaust: 'bg-red-800 text-red-300',
    Sustain: 'bg-green-700 text-green-200',
    Wildcard: 'bg-yellow-700 text-yellow-200',
    Glitch: 'bg-red-600 text-red-100',
    Leech: 'bg-emerald-700 text-emerald-200',
    Stabilize: 'bg-sky-700 text-sky-200',
  };
  return map[kw] ?? 'bg-slate-600 text-slate-200';
}

/** Waveform type color */
function typeColor(type: string): string {
  const map: Record<string, string> = {
    Pulse: 'text-red-400',
    Sine: 'text-blue-400',
    Saw: 'text-green-400',
    Noise: 'text-pink-400',
  };
  return map[type] ?? 'text-slate-400';
}

/** Rarity border color */
function rarityBorder(rarity: string): string {
  if (rarity === 'rare') return 'border-l-purple-500 bg-purple-900/20';
  if (rarity === 'uncommon') return 'border-l-blue-500 bg-blue-900/20';
  return 'border-l-slate-500 bg-slate-800';
}

/** Relic rarity border color */
function relicRarityBorder(rarity: string): string {
  if (rarity === 'rare') return 'border-l-purple-500 bg-purple-900/20';
  if (rarity === 'uncommon') return 'border-l-orange-500 bg-orange-900/20';
  return 'border-l-yellow-600 bg-yellow-900/20';
}

export function SignalForgeUI({
  gameState,
  onStartGame,
  onNextFloor,
  onBuyItem,
  onRemoveCard,
  onProceedFromShop,
  onReturnToLanding,
  hasSavedRun,
  onLoadSavedRun,
  onAbandonRun,
  showPauseMenu: showPauseMenuProp,
  setShowPauseMenu: setShowPauseMenuProp,
}: SignalForgeUIProps) {
  const session = authClient.useSession();
  const router = useRouter();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ username: string; highScore: number; floorReached: number }>>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [selectingCardToRemove, setSelectingCardToRemove] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showPauseMenuLocal, setShowPauseMenuLocal] = useState(false);
  const showPauseMenu = showPauseMenuProp ?? showPauseMenuLocal;
  const setShowPauseMenu = setShowPauseMenuProp ?? setShowPauseMenuLocal;
  const autoSubmitRef = useRef(false);

  // Escape key opens/closes pause menu during active gameplay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
        setShowPauseMenu(!showPauseMenu);
        setShowCollection(false);
        setShowHowToPlay(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.phase, showPauseMenu, setShowPauseMenu]);

  const loadLeaderboard = async () => {
    try {
      const res = await fetch('/api/signal-forge/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  };

  const submitScore = async () => {
    if (!session.data) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/signal-forge/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: gameState.score,
          floorReached: gameState.floor,
        }),
      });

      if (res.ok) {
        setScoreSubmitted(true);
        loadLeaderboard();
      }
    } catch (error) {
      console.error('Failed to submit score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchLeaderboard = async () => {
    await loadLeaderboard();
    setShowLeaderboard(true);
  };

  // Fetch leaderboard on mount for landing page
  useEffect(() => {
    loadLeaderboard();
  }, []);

  // Auto-submit score when game ends
  useEffect(() => {
    if (gameState.phase === 'game-over' && session.data && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      submitScore();
    }
    if (gameState.phase === 'landing') {
      // Reset for next game
      autoSubmitRef.current = false;
      setScoreSubmitted(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase, session.data]);

  if (gameState.phase === 'landing') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        {/* How to Play Modal */}
        {showHowToPlay && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-60" onClick={() => setShowHowToPlay(false)}>
            <div className="bg-slate-900 border-2 border-cyan-500 p-6 rounded-lg max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-cyan-400 mb-4">How to Play</h2>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🎯 Goal</h3>
                  <p>Defeat all enemies on each floor, climb as high as you can, and score big.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🃏 Cards & Energy</h3>
                  <p>Play cards from your hand by spending Energy (resets each turn). Cards deal damage, grant shield, draw more cards, or trigger special abilities. When your draw pile is empty, you can&apos;t draw more — manage your deck carefully.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔀 Pattern Matching</h3>
                  <p>Each turn has a target waveform sequence (Pulse, Sine, Saw, Noise). Play cards in order to match it. A full match triggers a <span className="text-green-400">Forge Burst</span> for +12 bonus damage. Wildcard cards match any slot.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⚡ Tempo & Static</h3>
                  <p><span className="text-yellow-300">Tempo</span> builds as you play cards — higher tempo increases damage. <span className="text-red-300">Static</span> accumulates and injects unplayable Glitch cards into your discard pile when it hits the threshold.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🛡 Shield & Combat</h3>
                  <p>Shield absorbs enemy damage before HP. After you end your turn, enemies attack. Click an enemy to target it with single-target cards.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">👹 Enemies</h3>
                  <p>Enemies have special abilities — hover over them to see details. Some shield allies, regenerate, inject Glitch cards, reflect damage, or enrage when wounded.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🏪 Shop & Relics</h3>
                  <p>Between floors, spend currency to buy new cards, powerful relics, or remove weak cards from your deck. More items appear at higher floors.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">💡 Tips</h3>
                  <p>Hover over everything in-game for tooltips. Keep your deck lean. Prioritize matching patterns for burst damage. Watch out for Static buildup!</p>
                </div>
              </div>
              <Button
                onClick={() => setShowHowToPlay(false)}
                className="w-full mt-4 bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-2 rounded-lg"
              >
                Got It
              </Button>
            </div>
          </div>
        )}
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400 mb-4">SIGNAL FORGE</h1>
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
            <h3 className="text-xl font-bold text-cyan-400 mb-3 flex items-center gap-2">🏆 Top Scores</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto bg-black bg-opacity-50 p-3 rounded border border-slate-700">
              {leaderboard.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No scores yet. Be the first!</p>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm font-mono p-2 hover:bg-slate-800 rounded">
                    <span className={`font-bold w-8 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-cyan-400'}`}>
                      #{idx + 1}
                    </span>
                    <span className="flex-1 ml-2 text-slate-300 truncate">{entry.username}</span>
                    <span className="text-green-400 font-bold ml-4">{entry.highScore}</span>
                    <span className="text-slate-500 ml-3 text-xs">F{entry.floorReached}</span>
                  </div>
                ))
              )}
            </div>
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

  // Pause Menu modal (Escape key) — must be before phase-specific early returns
  if (showPauseMenu && gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        {/* How to Play sub-modal */}
        {showHowToPlay && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-60" onClick={() => setShowHowToPlay(false)}>
            <div className="bg-slate-900 border-2 border-cyan-500 p-6 rounded-lg max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-cyan-400 mb-4">How to Play</h2>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🎯 Goal</h3>
                  <p>Defeat all enemies on each floor, climb as high as you can, and score big.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🃏 Cards & Energy</h3>
                  <p>Play cards from your hand by spending Energy (resets each turn). Cards deal damage, grant shield, draw more cards, or trigger special abilities. When your draw pile is empty, you can&apos;t draw more — manage your deck carefully.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔀 Pattern Matching</h3>
                  <p>Each turn has a target waveform sequence (Pulse, Sine, Saw, Noise). Play cards in order to match it. A full match triggers a <span className="text-green-400">Forge Burst</span> for +12 bonus damage. Wildcard cards match any slot.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⚡ Tempo & Static</h3>
                  <p><span className="text-yellow-300">Tempo</span> builds as you play cards — higher tempo increases damage. <span className="text-red-300">Static</span> accumulates and injects unplayable Glitch cards into your discard pile when it hits the threshold.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🛡 Shield & Combat</h3>
                  <p>Shield absorbs enemy damage before HP. After you end your turn, enemies attack. Click an enemy to target it with single-target cards.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">👹 Enemies</h3>
                  <p>Enemies have special abilities — hover over them to see details. Some shield allies, regenerate, inject Glitch cards, reflect damage, or enrage when wounded.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🏪 Shop & Relics</h3>
                  <p>Between floors, spend currency to buy new cards, powerful relics, or remove weak cards from your deck. More items appear at higher floors.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">💡 Tips</h3>
                  <p>Hover over everything in-game for tooltips. Keep your deck lean. Prioritize matching patterns for burst damage. Watch out for Static buildup!</p>
                </div>
              </div>
              <Button
                onClick={() => setShowHowToPlay(false)}
                className="w-full mt-4 bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-2 rounded-lg"
              >
                Got It
              </Button>
            </div>
          </div>
        )}
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400">SIGNAL FORGE</h1>
            <span className="text-slate-500 text-xs font-mono">Floor {gameState.floor} · {gameState.score} pts</span>
          </div>
          <p className="text-slate-400 text-sm mb-6">Game Paused</p>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => setShowPauseMenu(false)}
              className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg border border-cyan-400 shadow-lg"
            >
              Resume Game
            </Button>
            {onAbandonRun && (
              <Button
                onClick={() => {
                  if (confirm('Abandon this run? Your progress will be lost and the save cleared.')) {
                    setShowPauseMenu(false);
                    onAbandonRun();
                  }
                }}
                className="w-full bg-red-900/60 hover:bg-red-800 text-red-300 font-bold py-2 rounded-lg border border-red-700"
              >
                ☠ Abandon Run
              </Button>
            )}
          </div>

          {/* Leaderboard */}
          <div className="mt-8 border-t border-slate-700 pt-6">
            <h3 className="text-xl font-bold text-cyan-400 mb-3 flex items-center gap-2">🏆 Top Scores</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto bg-black bg-opacity-50 p-3 rounded border border-slate-700">
              {leaderboard.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No scores yet. Be the first!</p>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm font-mono p-2 hover:bg-slate-800 rounded">
                    <span className={`font-bold w-8 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-cyan-400'}`}>
                      #{idx + 1}
                    </span>
                    <span className="flex-1 ml-2 text-slate-300 truncate">{entry.username}</span>
                    <span className="text-green-400 font-bold ml-4">{entry.highScore}</span>
                    <span className="text-slate-500 ml-3 text-xs">F{entry.floorReached}</span>
                  </div>
                ))
              )}
            </div>
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

  if (gameState.phase === 'reward') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-green-900 to-black border-2 border-green-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-bold text-green-400 mb-4">Victory!</h2>
          <div className="space-y-4 mb-6 text-slate-300">
            <p>Floor: <span className="text-green-400 font-bold text-lg">{gameState.floor}</span></p>
            <p>Score: <span className="text-green-400 font-bold text-lg">{gameState.score}</span></p>
            <p>Currency: <span className="text-yellow-400 font-bold text-lg">{gameState.currency}</span></p>
          </div>
          <Button
            onClick={onNextFloor}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg"
          >
            Enter Shop
          </Button>
        </div>
      </div>
    );
  }

  // Card removal selector modal
  if (selectingCardToRemove && gameState.deckList.length > 0) {
    const removalCurrency = gameState.shopInventory.find(i => i.type === 'removal')?.price ?? 60;
    const canRemove = gameState.currency >= removalCurrency;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-red-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-red-400">Select Card to Remove</h2>
            <button
              onClick={() => setSelectingCardToRemove(false)}
              className="text-slate-400 hover:text-red-400 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          <p className="text-slate-300 mb-4">Choose a card to remove from your deck (Cost: {removalCurrency})</p>
          
          <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700 mb-6">
            {gameState.deckList.map((card) => {
              const tags = cardKeywordTags(card);
              return (
                <div key={card.id} className={`border-l-4 p-3 rounded hover:brightness-110 transition ${rarityBorder(card.rarity)}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-100">{card.name}</h4>
                        {tags.map(t => (
                          <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 capitalize mt-0.5">
                        <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · Cost {card.cost >= 99 ? '✕' : card.cost}
                      </p>
                      <div className="flex gap-3 text-xs mt-1">
                        {card.damage > 0 && <span className="text-red-400">⚔️ {card.getEffectiveDamage()}{card.echo ? ' (Echo)' : ''}{card.aoe ? ' AOE' : ''}</span>}
                        {card.shield > 0 && <span className="text-blue-400">🛡️ {card.getEffectiveShield()}{card.echo ? ' (Echo)' : ''}</span>}
                        {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                        {card.leech ? <span className="text-emerald-400">Leech {card.leech}%</span> : null}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                    </div>
                    <Button
                      onClick={() => {
                        onRemoveCard?.(card.id);
                        setSelectingCardToRemove(false);
                      }}
                      disabled={!canRemove}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-bold px-4 py-2 rounded ml-3 shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            onClick={() => setSelectingCardToRemove(false)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'shop' && !showCollection) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-cyan-400">Shop - Floor {gameState.floor}</h2>
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setShowCollection(true)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-3 rounded text-sm"
              >
                📚 Collection
              </button>
              <div className="text-yellow-400 font-bold text-lg">💰 {gameState.currency}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 max-h-96 overflow-y-auto">
            {gameState.shopInventory.map((item) => {
              const isAffordable = gameState.currency >= item.price;
              
              if (item.type === 'removal') {
                return (
                  <div key={item.id} className="bg-slate-800 border border-red-500 p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-red-400 font-bold">Remove Card</h3>
                      <span className={`text-lg font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>
                        {item.price}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">Remove a card from your deck ({gameState.deckList.length} available)</p>
                    {gameState.deckList.length > 0 ? (
                      <Button
                        onClick={() => setSelectingCardToRemove(true)}
                        disabled={!isAffordable}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-bold py-2 rounded"
                      >
                        Select Card to Remove
                      </Button>
                    ) : (
                      <p className="text-slate-400 text-sm text-center py-2">No cards to remove</p>
                    )}
                  </div>
                );
              }
              
              if (item.type === 'card' && item.item && 'type' in item.item) {
                const card = item.item as Card;
                const tags = cardKeywordTags(card);
                return (
                  <div key={item.id} className={`border p-4 rounded-lg ${card.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : card.rarity === 'uncommon' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-500 bg-slate-800'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <h3 className="font-bold text-slate-100">{card.name}</h3>
                        <p className="text-xs text-slate-400 capitalize">
                          <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>
                        💰 {item.price}
                      </span>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-2">
                        {tags.map(t => (
                          <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 text-sm mb-1">
                      {card.damage > 0 && <span className="text-red-400">⚔️ {card.getEffectiveDamage()}{card.echo ? ' (Echo)' : ''}{card.aoe ? ' AOE' : ''}</span>}
                      {card.shield > 0 && <span className="text-blue-400">🛡️ {card.getEffectiveShield()}{card.echo ? ' (Echo)' : ''}</span>}
                      <span className="text-slate-400">Cost: {card.cost >= 99 ? '✕' : card.cost}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-slate-400 mb-2">
                      {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                      {card.tempoGain ? <span className="text-purple-400">+{card.tempoGain} tempo</span> : null}
                      {card.leech ? <span className="text-emerald-400">Leech {card.leech}%</span> : null}
                      {card.selfDamage ? <span className="text-red-300">Self-dmg {card.selfDamage}</span> : null}
                      {card.stabilize ? <span className="text-sky-400">Purge {card.stabilize} Glitch</span> : null}
                      {card.staticReduce ? <span className="text-sky-300">-{card.staticReduce} Static</span> : null}
                      {card.staticGain ? <span className="text-red-300">+{card.staticGain} Static</span> : null}
                      {card.glitchGen ? <span className="text-red-400">+{card.glitchGen} Glitch</span> : null}
                    </div>
                    <p className="text-xs text-slate-300 italic mb-3">{card.effect}</p>
                    <Button
                      onClick={() => onBuyItem?.(item.id)}
                      disabled={!isAffordable}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-bold py-2 rounded"
                    >
                      Buy
                    </Button>
                  </div>
                );
              }
              
              if (item.type === 'relic' && item.item && 'description' in item.item) {
                const relic = item.item as Relic;
                const relicBorder = relic.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : relic.rarity === 'uncommon' ? 'border-orange-500 bg-orange-900/20' : 'border-yellow-600 bg-yellow-900/20';
                return (
                  <div key={item.id} className={`border p-4 rounded-lg ${relicBorder}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-slate-100">🔮 {relic.name}</h3>
                        <p className="text-xs text-slate-400 capitalize">{relic.rarity} Relic</p>
                      </div>
                      <span className={`text-lg font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>
                        💰 {item.price}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mb-3">{relic.description}</p>
                    <Button
                      onClick={() => onBuyItem?.(item.id)}
                      disabled={!isAffordable}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 text-white font-bold py-2 rounded"
                    >
                      Buy
                    </Button>
                  </div>
                );
              }
            })}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={onProceedFromShop}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
            >
              Continue (Floor {gameState.floor})
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'game-over') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-red-900 to-black border-2 border-red-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-bold text-red-400 mb-4">Game Over</h2>
          <div className="space-y-4 mb-6 text-slate-300">
            <p>Score: <span className="text-red-400 font-bold text-lg">{gameState.score}</span></p>
            <p>Floor Reached: <span className="text-red-400 font-bold text-lg">{gameState.floor}</span></p>
          </div>

          {/* Auto-submit status */}
          {session.data && (
            <div className="mb-4 text-center">
              {isSubmitting ? (
                <div className="text-yellow-400 text-sm font-mono animate-pulse">⏳ Submitting score...</div>
              ) : scoreSubmitted ? (
                <div className="text-green-400 text-sm font-mono">✓ Score submitted</div>
              ) : (
                <div className="text-slate-500 text-sm font-mono">Score submission pending...</div>
              )}
            </div>
          )}
          {!session.data && (
            <div className="mb-4 text-center">
              <p className="text-slate-400 text-sm">Sign in to save your score to the leaderboard.</p>
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={fetchLeaderboard}
              variant="outline"
              className="w-full border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-20 py-2 rounded-lg"
            >
              View Leaderboard
            </Button>
            <Button
              onClick={onReturnToLanding}
              className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 rounded-lg border border-cyan-400 shadow-lg"
            >
              Return to Menu
            </Button>
          </div>
        </div>

        {showLeaderboard && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
            <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
              <h3 className="text-2xl font-bold text-cyan-400 mb-4">🏆 Top Scores</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto mb-4 bg-black bg-opacity-50 p-3 rounded border border-slate-700">
                {leaderboard.length === 0 ? (
                  <p className="text-slate-400 text-sm">No scores yet. Be the first!</p>
                ) : (
                  leaderboard.map((entry, idx) => (
                    <div key={idx} className="flex justify-between text-slate-300 text-sm font-mono p-2 hover:bg-slate-800 rounded">
                      <span className="text-cyan-400 font-bold">#{idx + 1}</span>
                      <span className="flex-1 ml-3">{entry.username}</span>
                      <span className="text-green-400 font-bold">{entry.highScore}</span>
                    </div>
                  ))
                )}
              </div>
              <Button
                onClick={() => setShowLeaderboard(false)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Collection modal - accessible from any phase
  if (showCollection) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-4xl w-full shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-cyan-400">Collection</h2>
            <button
              onClick={() => setShowCollection(false)}
              className="text-slate-400 hover:text-cyan-400 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Cards Section */}
            <div>
              <h3 className="text-2xl font-bold text-green-400 mb-4">Deck Collection ({gameState.deckList.length})</h3>
              <p className="text-xs text-slate-400 mb-3">
                Draw pile: {gameState.deck.length} | Hand: {gameState.hand.length} | Discard: {gameState.discard.length}
              </p>
              <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700">
                {gameState.deckList.length === 0 ? (
                  <p className="text-slate-400 text-sm">No cards yet. Build your deck in the shop!</p>
                ) : (
                  gameState.deckList.map((card) => {
                    const inHand = gameState.hand.some(c => c.id === card.id);
                    const inDiscard = gameState.discard.some(c => c.id === card.id);
                    const inDeck = gameState.deck.some(c => c.id === card.id);
                    const statusLabel = inHand ? '🖐️ Hand' : inDiscard ? '💨 Discard' : inDeck ? '📚 Deck' : '?';
                    const tags = cardKeywordTags(card);
                    
                    return (
                      <div key={card.id} className={`border-l-4 p-3 rounded ${rarityBorder(card.rarity)}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-100">{card.name}</h4>
                              {tags.map(t => (
                                <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                              ))}
                            </div>
                            <p className="text-xs text-slate-400 capitalize mt-0.5">
                              <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · Cost {card.cost >= 99 ? '✕' : card.cost}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500 ml-2 whitespace-nowrap">{statusLabel}</span>
                        </div>
                        <div className="flex gap-3 text-xs mt-2 flex-wrap">
                          {card.damage > 0 && <span className="text-red-400">⚔️ {card.getEffectiveDamage()}{card.echo ? ' (Echo +50%)' : ''}{card.aoe ? ' [AOE]' : ''}</span>}
                          {card.shield > 0 && <span className="text-blue-400">🛡️ {card.getEffectiveShield()}{card.echo ? ' (Echo +50%)' : ''}</span>}
                          {card.draw ? <span className="text-cyan-400">📥 +{card.draw} draw</span> : null}
                          {card.tempoGain ? <span className="text-purple-400">🎵 +{card.tempoGain} tempo</span> : null}
                          {card.leech ? <span className="text-emerald-400">🧛 Leech {card.leech}%</span> : null}
                          {card.selfDamage ? <span className="text-red-300">💔 Self-dmg {card.selfDamage}</span> : null}
                          {card.stabilize ? <span className="text-sky-400">🧹 Purge {card.stabilize} Glitch</span> : null}
                          {card.staticReduce ? <span className="text-sky-300">📉 -{card.staticReduce} Static</span> : null}
                          {card.staticGain ? <span className="text-red-300">📈 +{card.staticGain} Static</span> : null}
                          {card.glitchGen ? <span className="text-red-400">⚡ +{card.glitchGen} Glitch</span> : null}
                        </div>
                        <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Relics Section */}
            <div>
              <h3 className="text-2xl font-bold text-yellow-400 mb-4">Relics & Upgrades ({gameState.ownedRelics.length})</h3>
              <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700">
                {gameState.ownedRelics.length === 0 ? (
                  <p className="text-slate-400 text-sm">No relics yet. Purchase them in the shop!</p>
                ) : (
                  gameState.ownedRelics.map((relic) => (
                    <div key={relic.id} className={`border-l-4 p-3 rounded ${relicRarityBorder(relic.rarity)}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-100">🔮 {relic.name}</h4>
                          <p className="text-xs text-slate-400 capitalize">
                            {relic.rarity} Relic{relic.key ? ` · ${relic.key}` : ''}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          relic.rarity === 'rare' ? 'bg-purple-700 text-purple-200'
                          : relic.rarity === 'uncommon' ? 'bg-orange-700 text-orange-200'
                          : 'bg-yellow-700 text-yellow-200'
                        }`}>{relic.rarity.toUpperCase()}</span>
                      </div>
                      <p className="text-sm text-slate-300 mt-2">{relic.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={() => setShowCollection(false)}
            className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg"
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      {gameState.phase !== 'landing' && gameState.phase !== 'game-over' && (
        <button
          onClick={() => setShowCollection(true)}
          className="fixed bottom-6 left-6 pointer-events-auto bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-lg border border-cyan-400 shadow-lg transition-all"
        >
          📚 Collection
        </button>
      )}
    </div>
  );
}
