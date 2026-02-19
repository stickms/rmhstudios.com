'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import type { Card, Enemy, Relic, RelicData, RelicTemplate } from '@/lib/signal-forge';
import { CARD_CATALOG } from '@/lib/signal-forge';

interface ShopItem {
  id: string;
  type: 'card' | 'relic' | 'removal' | 'upgrade';
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
  cardRewardChoices: Card[];
  mulliganAvailable: boolean;
  mulliganSelected: number[];
  upgradesPurchased: number;
  removalsUsed: number;
  reshuffleCount: number;
  playerStatuses: unknown[];
  defeatedBossName?: string;
  damageTakenLastTurn: number;
  waveformTypesPlayedThisTurn: string[];
  momentumCoreActive: boolean;
  safeLandingUsed: boolean;
  voidHarvesterDmgBonus: number;
  voidShieldActive: boolean;
  floorDamageTaken: number;
  floorPatternsCompleted: number;
  floorTurns: number;
  shopRefreshesUsed: number;
  starterRelicChoices: RelicTemplate[];
  handSortMode: 'none' | 'cost' | 'type' | 'damage';
  viewingPile: 'deck' | 'discard' | null;
  currentEvent?: { name: string; description: string; choices: { label: string; description: string }[] };
  overwriterPenUsed: boolean;
  overwriterPenTarget: number | null;
  relicBoughtThisShop: boolean;
  shopRemovalsUsed: number;
  shopUpgradesUsed: number;
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
  onUpgradeCard?: (cardId: number) => void;
  onProceedFromShop?: () => void;
  onReturnToLanding?: () => void;
  hasSavedRun?: boolean;
  onLoadSavedRun?: () => void;
  onAbandonRun?: () => void;
  showPauseMenu?: boolean;
  setShowPauseMenu?: (v: boolean) => void;
  onSelectCardReward?: (card: Card) => void;
  onSkipCardReward?: () => void;
  onToggleMulliganCard?: (index: number) => void;
  onConfirmMulligan?: () => void;
  onSkipMulligan?: () => void;
  onSelectStarterRelic?: (relic: RelicTemplate) => void;
  onResolveEvent?: (choiceIndex: number) => void;
  onChooseRest?: () => void;
  onChooseShop?: () => void;
  onRefreshShop?: () => void;
  onToggleViewPile?: (pile: 'deck' | 'discard' | null) => void;
  onCycleSortMode?: () => void;
  onActivateOverwriterPen?: (handIndex: number) => void;
  onCancelOverwriterPen?: () => void;
  onConfirmOverwriterPen?: (cardKey: string) => void;
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
  if (card.piercing) tags.push('Piercing');
  if (card.chain) tags.push('Chain');
  if (card.growing) tags.push('Growing');
  if (card.retain) tags.push('Retain');
  if (card.multihit && card.multihit > 1) tags.push('Multihit');
  if (card.innate) tags.push('Innate');
  if (card.ethereal) tags.push('Ethereal');
  if (card.siphon) tags.push('Siphon');
  if (card.bleed) tags.push('Bleed');
  if (card.freeze) tags.push('Freeze');
  if (card.vulnerable) tags.push('Vulnerable');
  if (card.weak) tags.push('Weak');
  if (card.upgraded) tags.push('Upgraded');
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
    Piercing: 'bg-yellow-600 text-yellow-100',
    Chain: 'bg-orange-600 text-orange-100',
    Growing: 'bg-green-600 text-green-100',
    Retain: 'bg-purple-600 text-purple-100',
    Multihit: 'bg-red-700 text-red-200',
    Innate: 'bg-cyan-700 text-cyan-200',
    Ethereal: 'bg-pink-700 text-pink-200',
    Siphon: 'bg-teal-700 text-teal-200',
    Bleed: 'bg-red-600 text-red-200',
    Freeze: 'bg-blue-700 text-blue-200',
    Vulnerable: 'bg-orange-800 text-orange-200',
    Weak: 'bg-yellow-800 text-yellow-200',
    Upgraded: 'bg-amber-600 text-amber-100',
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
  onUpgradeCard,
  onProceedFromShop,
  onReturnToLanding,
  hasSavedRun,
  onLoadSavedRun,
  onAbandonRun,
  showPauseMenu: showPauseMenuProp,
  setShowPauseMenu: setShowPauseMenuProp,
  onToggleMulliganCard,
  onConfirmMulligan,
  onSkipMulligan,
  onSelectCardReward,
  onSkipCardReward,
  onSelectStarterRelic,
  onResolveEvent,
  onChooseRest,
  onChooseShop,
  onRefreshShop,
  onToggleViewPile,
  onCycleSortMode,
  onActivateOverwriterPen,
  onCancelOverwriterPen,
  onConfirmOverwriterPen,
}: SignalForgeUIProps) {
  const session = authClient.useSession();
  const router = useRouter();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ username: string; highScore: number; floorReached: number }>>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [selectingCardToRemove, setSelectingCardToRemove] = useState(false);
  const [selectingCardToUpgrade, setSelectingCardToUpgrade] = useState(false);
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
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 pt-14">
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
                  <p>Play cards from your hand by spending Energy (resets each turn). Cards deal damage, grant shield, draw more cards, or trigger special abilities. When your draw pile is empty, reshuffling costs increasing fatigue damage.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔀 Pattern Matching</h3>
                  <p>Each turn has a target waveform sequence (Pulse, Sine, Saw, Noise). Play cards in order to match it. A full match triggers a <span className="text-green-400">Forge Burst</span> for bonus damage. Wildcard cards (★) match any slot.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⚡ Tempo & Static</h3>
                  <p><span className="text-yellow-300">Tempo</span> builds as you play cards (cap 6) — higher tempo adds damage. <span className="text-red-300">Static</span> accumulates from duplicate types and can inject unplayable Glitch cards.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🛡 Shield & Combat</h3>
                  <p>Shield absorbs enemy damage before HP, then resets. After you end your turn, enemies attack. Click an enemy to target it.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔑 Card Keywords</h3>
                  <p className="space-y-1">
                    <span className="block"><span className="text-yellow-400">Piercing</span> — ignores armor. <span className="text-blue-400">Echo</span> — +50% damage &amp; shield.</span>
                    <span className="block"><span className="text-orange-400">Chain</span> — discount on same-type followup. <span className="text-green-400">Growing</span> — gains power each play.</span>
                    <span className="block"><span className="text-purple-400">Retain</span> — stays in hand after turn. <span className="text-red-400">Multihit</span> — hits multiple times.</span>
                    <span className="block"><span className="text-cyan-400">Innate</span> — always drawn first. <span className="text-pink-400">Ethereal</span> — exhausted if not played.</span>
                    <span className="block"><span className="text-teal-400">Siphon</span> — steals enemy shield. <span className="text-amber-400">Leech</span> — heals from damage dealt.</span>
                  </p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">💀 Status Effects</h3>
                  <p><span className="text-red-400">Bleed</span> deals damage/turn. <span className="text-blue-400">Freeze</span> skips attacks. <span className="text-orange-400">Vulnerable</span> takes +50% damage. <span className="text-yellow-400">Weak</span> deals -25% damage. <span className="text-purple-400">Marked</span> takes +5 flat damage.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">👹 Enemies & Bosses</h3>
                  <p>Enemies have special abilities — hover for details. Bosses appear every 5th floor and drop unique relics.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🏪 Shop, Events & Rest</h3>
                  <p>Between floors: buy cards/relics, remove or upgrade cards. Every 3rd floor, choose to Rest (heal 50%) or Shop (heal 25% + shop). Random events may appear with risk/reward choices.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🌐 Zones & Upgrades</h3>
                  <p>Each combat has a random zone modifier (damage boost, shield boost, static field, etc.). Cards can be upgraded in the shop for improved stats.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⌨️ Shortcuts</h3>
                  <p>1-9: Play cards · Q: End turn · S: Sort hand · D: View deck · F: View discard</p>
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
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl max-h-[calc(100vh-4.5rem)] overflow-y-auto">
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
                  <p>Play cards from your hand by spending Energy (resets each turn). Cards deal damage, grant shield, draw more cards, or trigger special abilities. When your draw pile is empty, reshuffling costs increasing fatigue damage.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔀 Pattern Matching</h3>
                  <p>Each turn has a target waveform sequence (Pulse, Sine, Saw, Noise). Play cards in order to match it. A full match triggers a <span className="text-green-400">Forge Burst</span> for bonus damage. Wildcard cards (★) match any slot.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⚡ Tempo & Static</h3>
                  <p><span className="text-yellow-300">Tempo</span> builds as you play cards (cap 6) — higher tempo adds damage. <span className="text-red-300">Static</span> accumulates from duplicate types and can inject unplayable Glitch cards.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🛡 Shield & Combat</h3>
                  <p>Shield absorbs enemy damage before HP, then resets. After you end your turn, enemies attack. Click an enemy to target it.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🔑 Card Keywords</h3>
                  <p className="space-y-1">
                    <span className="block"><span className="text-yellow-400">Piercing</span> — ignores armor. <span className="text-blue-400">Echo</span> — +50% damage &amp; shield.</span>
                    <span className="block"><span className="text-orange-400">Chain</span> — discount on same-type followup. <span className="text-green-400">Growing</span> — gains power each play.</span>
                    <span className="block"><span className="text-purple-400">Retain</span> — stays in hand after turn. <span className="text-red-400">Multihit</span> — hits multiple times.</span>
                    <span className="block"><span className="text-cyan-400">Innate</span> — always drawn first. <span className="text-pink-400">Ethereal</span> — exhausted if not played.</span>
                    <span className="block"><span className="text-teal-400">Siphon</span> — steals enemy shield. <span className="text-amber-400">Leech</span> — heals from damage dealt.</span>
                  </p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">💀 Status Effects</h3>
                  <p><span className="text-red-400">Bleed</span> deals damage/turn. <span className="text-blue-400">Freeze</span> skips attacks. <span className="text-orange-400">Vulnerable</span> takes +50% damage. <span className="text-yellow-400">Weak</span> deals -25% damage. <span className="text-purple-400">Marked</span> takes +5 flat damage.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">👹 Enemies & Bosses</h3>
                  <p>Enemies have special abilities — hover for details. Bosses appear every 5th floor and drop unique relics.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🏪 Shop, Events & Rest</h3>
                  <p>Between floors: buy cards/relics, remove or upgrade cards. Every 3rd floor, choose to Rest (heal 50%) or Shop (heal 25% + shop). Random events may appear with risk/reward choices.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">🌐 Zones & Upgrades</h3>
                  <p>Each combat has a random zone modifier (damage boost, shield boost, static field, etc.). Cards can be upgraded in the shop for improved stats.</p>
                </div>
                <div>
                  <h3 className="text-cyan-300 font-bold mb-1">⌨️ Shortcuts</h3>
                  <p>1-9: Play cards · Q: End turn · S: Sort hand · D: View deck · F: View discard</p>
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

  // Starter Relic Choice (before first combat)
  if (gameState.phase === 'starter-relic' && onSelectStarterRelic) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-2xl w-full">
          <h2 className="text-2xl font-bold text-center mb-2 text-cyan-400">Choose a Starting Relic</h2>
          <p className="text-gray-400 text-center mb-6">This will shape your early strategy.</p>
          <div className="flex gap-4 justify-center">
            {gameState.starterRelicChoices.map((relic, i) => (
              <button key={i} onClick={() => onSelectStarterRelic(relic)}
                className="bg-gray-800 border-2 border-gray-600 hover:border-yellow-400 rounded-lg p-4 w-56 transition-colors">
                <div className="text-sm font-bold text-yellow-400">{relic.name}</div>
                <div className="text-xs text-gray-300 mt-2">{relic.description}</div>
                <div className="text-xs text-gray-500 mt-1 capitalize">{relic.rarity}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Event phase
  if (gameState.phase === 'event' && gameState.currentEvent && onResolveEvent) {
    const event = gameState.currentEvent;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-lg w-full">
          <h2 className="text-xl font-bold text-yellow-400 mb-2">{event.name}</h2>
          <p className="text-gray-300 mb-6">{event.description}</p>
          <div className="space-y-3">
            {event.choices.map((choice, i) => (
              <button key={i} onClick={() => onResolveEvent(i)}
                className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg p-3 text-left transition-colors">
                <div className="font-bold text-white">{choice.label}</div>
                <div className="text-sm text-gray-400">{choice.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Rest vs Shop choice (every 3rd floor)
  if (gameState.phase === 'rest-or-shop' && onChooseRest && onChooseShop) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-center mb-2 text-cyan-400">Choose Your Path</h2>
          <p className="text-gray-400 text-center mb-6">Floor {gameState.floor} cleared!</p>
          <div className="flex gap-4 justify-center">
            <button onClick={onChooseRest}
              className="bg-green-900/50 border-2 border-green-600 hover:border-green-400 rounded-lg p-6 w-52 transition-colors">
              <div className="text-lg font-bold text-green-400 mb-2">🛏️ Rest</div>
              <div className="text-sm text-gray-300">Heal 50% of max HP</div>
              <div className="text-xs text-gray-500 mt-1">Skip the shop</div>
            </button>
            <button onClick={onChooseShop}
              className="bg-yellow-900/50 border-2 border-yellow-600 hover:border-yellow-400 rounded-lg p-6 w-52 transition-colors">
              <div className="text-lg font-bold text-yellow-400 mb-2">🛒 Shop</div>
              <div className="text-sm text-gray-300">Heal 25% + visit shop</div>
              <div className="text-xs text-gray-500 mt-1">Buy cards & relics</div>
            </button>
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

  // Phase 6.3 — Card upgrade selector modal
  if (selectingCardToUpgrade && gameState.deckList.length > 0) {
    const upgradeCurrency = gameState.shopInventory.find(i => i.type === 'upgrade')?.price ?? 50;
    const canUpgrade = gameState.currency >= upgradeCurrency;
    const upgradableCards = gameState.deckList.filter(c => !c.upgraded);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-yellow-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-yellow-400">Select Card to Upgrade</h2>
            <button
              onClick={() => setSelectingCardToUpgrade(false)}
              className="text-slate-400 hover:text-yellow-400 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          <p className="text-slate-300 mb-4">Choose a card to upgrade: +25% damage/shield (Cost: {upgradeCurrency})</p>
          
          <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700 mb-6">
            {upgradableCards.map((card) => {
              const tags = cardKeywordTags(card);
              const newDamage = Math.ceil(card.damage * 1.25);
              const newShield = Math.ceil(card.shield * 1.25);
              
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
                        {card.damage > 0 && (
                          <span className="text-red-400">
                            ⚔️ {card.damage} → <span className="text-yellow-400 font-bold">{newDamage}</span>
                          </span>
                        )}
                        {card.shield > 0 && (
                          <span className="text-blue-400">
                            🛡️ {card.shield} → <span className="text-yellow-400 font-bold">{newShield}</span>
                          </span>
                        )}
                        {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                    </div>
                    <Button
                      onClick={() => {
                        onUpgradeCard?.(card.id);
                        setSelectingCardToUpgrade(false);
                      }}
                      disabled={!canUpgrade}
                      className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 text-white font-bold px-4 py-2 rounded ml-3 shrink-0"
                    >
                      Upgrade
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            onClick={() => setSelectingCardToUpgrade(false)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Phase 8.1 — Mulligan UI Banner with frosted overlay on upper section
  if (gameState.phase === 'combat' && gameState.mulliganAvailable && onToggleMulliganCard && onConfirmMulligan) {
    return (
      <>
        {/* Gray/blur overlay covering top through played area + a few px past, blocking canvas interaction */}
        <div className="fixed inset-x-0 top-0 h-[69%] bg-black/50 backdrop-blur-sm z-30">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
          {/* Mulligan banner centered in grayed-out area */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-gradient-to-b from-purple-900 to-purple-950 border-2 border-purple-400 p-4 rounded-lg shadow-2xl max-w-md">
              <div className="text-center mb-3">
                <h3 className="text-xl font-bold text-purple-300 mb-1">♻️ Mulligan Phase</h3>
                <p className="text-sm text-purple-200">
                  Click up to 2 cards below to replace them (selected: {gameState.mulliganSelected.length}/2)
                </p>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => onConfirmMulligan()}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition"
                >
                  {gameState.mulliganSelected.length > 0 ? `Redraw ${gameState.mulliganSelected.length}` : 'Keep Hand'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 8.1 — Deck/Discard Viewer Modal
  if (gameState.phase === 'combat' && gameState.viewingPile && onToggleViewPile) {
    const cards = gameState.viewingPile === 'deck' ? gameState.deck : gameState.discard;
    const pileLabel = gameState.viewingPile === 'deck' ? 'Draw Pile' : 'Discard Pile';
    const typeOrder: Record<string, number> = { Pulse: 0, Sine: 1, Saw: 2, Noise: 3 };
    const sortedCards = [...cards].sort((a, b) => {
      const typeA = typeOrder[a.type] ?? 4;
      const typeB = typeOrder[b.type] ?? 4;
      if (typeA !== typeB) return typeA - typeB;
      return a.cost - b.cost;
    });
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={() => onToggleViewPile(null)}>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-cyan-400">{pileLabel} ({cards.length} cards)</h2>
            <button onClick={() => onToggleViewPile(null)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {sortedCards.map((card, i) => {
              const typeColor = card.type === 'Pulse' ? 'border-red-500' : card.type === 'Sine' ? 'border-blue-500' : card.type === 'Saw' ? 'border-yellow-500' : 'border-gray-500';
              return (
                <div key={i} className={`bg-gray-800 border ${typeColor} rounded-lg p-2 text-xs`}>
                  <div className="font-bold text-slate-200">{card.name}{card.upgraded ? '+' : ''}</div>
                  <div className="text-gray-400">{card.type} · Cost {card.cost}</div>
                  <div className="flex gap-2 mt-1">
                    {card.damage > 0 && <span className="text-red-400">💢{card.damage}</span>}
                    {card.shield > 0 && <span className="text-blue-400">🛡️{card.shield}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-gray-500 text-xs mt-3 text-center">Press D for draw pile, F for discard, or click outside to close</p>
        </div>
      </div>
    );
  }

  // Overwriter's Pen — Card selection overlay (must be before combat HUD to not get blocked by early return)
  if (gameState.phase === 'combat' && gameState.overwriterPenTarget !== null && onCancelOverwriterPen && onConfirmOverwriterPen && onActivateOverwriterPen) {
    const targetCard = gameState.hand[gameState.overwriterPenTarget];
    const availableCards = gameState.deckList
      .filter(c => !c.isGlitch && c.id !== targetCard?.id)
      .reduce((acc, c) => {
        if (!acc.some(a => a.name === c.name)) acc.push(c);
        return acc;
      }, [] as Card[]);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50">
        <div className="bg-gradient-to-b from-slate-900 to-black border-2 border-purple-400 p-6 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <h2 className="text-2xl font-bold text-center mb-2 text-purple-300">
            ✏️ Overwriter&apos;s Pen
          </h2>

          {/* Select which hand card to transform */}
          <p className="text-center text-gray-400 mb-3 text-sm">
            Select a card from your hand to transform:
          </p>
          <div className="flex gap-2 justify-center mb-4 flex-wrap">
            {gameState.hand.map((card, i) => (
              <button
                key={card.id}
                onClick={() => onActivateOverwriterPen(i)}
                className={`px-3 py-2 rounded border text-sm ${
                  i === gameState.overwriterPenTarget
                    ? 'bg-purple-600 border-purple-300 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {card.name} ({card.cost}⚡)
              </button>
            ))}
          </div>

          {targetCard && (
            <>
              <p className="text-center text-gray-400 mb-3 text-sm">
                Transform <span className="text-purple-300 font-bold">{targetCard.name}</span> into:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
                {availableCards.map((card) => {
                  const typeColor: Record<string, string> = { Pulse: '#ff6b6b', Sine: '#6bffb8', Saw: '#ff9f43', Noise: '#a78bfa' };
                  return (
                    <button
                      key={card.id}
                      onClick={() => {
                        const matchKey = CARD_CATALOG.find(t => t.name === card.name)?.key;
                        if (matchKey) onConfirmOverwriterPen(matchKey);
                      }}
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded p-2 text-left"
                    >
                      <div className="text-sm font-bold" style={{ color: typeColor[card.type] || '#ccc' }}>{card.name}</div>
                      <div className="text-xs text-gray-400">{card.type} • {card.cost}⚡</div>
                      <div className="text-xs text-gray-500 mt-1">{card.effect}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="text-center">
            <button
              onClick={onCancelOverwriterPen}
              className="bg-gray-700 hover:bg-gray-600 border border-gray-500 rounded px-4 py-2 text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 8.1 — Combat HUD buttons (deck viewer + sort)
  if (gameState.phase === 'combat' && !gameState.mulliganAvailable) {
    return (
      <div className="fixed bottom-2 left-2 flex gap-2 z-30">
        {onToggleViewPile && (
          <>
            <button
              onClick={() => onToggleViewPile('deck')}
              className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
              title="View draw pile (D)"
            >
              📚 Deck ({gameState.deck.length})
            </button>
            <button
              onClick={() => onToggleViewPile('discard')}
              className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
              title="View discard pile (F)"
            >
              🗑️ Discard ({gameState.discard.length})
            </button>
          </>
        )}
        {onCycleSortMode && (
          <button
            onClick={onCycleSortMode}
            className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            title="Sort hand (S)"
          >
            ⬇️ Sort: {gameState.handSortMode}
          </button>
        )}
        {onActivateOverwriterPen && gameState.ownedRelics.some(r => r.key === 'overwriters_pen') && !gameState.overwriterPenUsed && (
          <button
            onClick={() => {
              // Enter transform mode — select 1st card, then use pen on click
              if (gameState.hand.length > 0) onActivateOverwriterPen(0);
            }}
            className="bg-purple-800/80 hover:bg-purple-700 border border-purple-400 rounded px-2 py-1 text-xs text-purple-200"
            title="Transform a card in hand (one-time)"
          >
            ✏️ Overwriter&apos;s Pen
          </button>
        )}
      </div>
    );
  }

  // Phase 6.2 — Card Reward Screen
  if (gameState.phase === 'card-reward' && onSelectCardReward && onSkipCardReward) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-gradient-to-b from-slate-900 to-black border-2 border-yellow-400 p-8 rounded-lg max-w-4xl w-full shadow-2xl">
          <h2 className="text-3xl font-bold text-center mb-6 text-yellow-400">
            ⭐ Choose Your Reward ⭐
          </h2>
          <div className="flex gap-6 justify-center mb-6">
            {gameState.cardRewardChoices.map((card, i) => {
              const keywords = cardKeywordTags(card);
              return (
                <button
                  key={i}
                  onClick={() => onSelectCardReward(card)}
                  className="bg-slate-800 border-2 border-cyan-500 hover:border-yellow-400 hover:scale-105 transition-all rounded-lg p-4 w-64"
                >
                  <div className="text-lg font-bold text-cyan-400">{card.name}</div>
                  <div className="text-xs text-slate-400 mb-2">
                    {card.type} • {card.rarity}
                  </div>
                  <div className="text-sm text-slate-300 mb-3 min-h-12">
                    {card.effect}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      {card.damage > 0 && <span className="text-red-400">⚔️ {card.damage} </span>}
                      {card.shield > 0 && <span className="text-blue-400">🛡️ {card.shield} </span>}
                    </div>
                    <div className="text-yellow-400 font-bold">
                      Cost: {card.cost}
                    </div>
                  </div>
                  {keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {keywords.map(kw => (
                        <span key={kw} className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onSkipCardReward()}
            className="block mx-auto text-slate-400 hover:text-yellow-400 font-bold text-lg"
          >
            Skip (+20 💰)
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'shop' && !showCollection) {
    const costScale = 1 + (gameState.floor - 1) * 0.08;
    const removalPrice = Math.round(50 * Math.pow(2, gameState.shopRemovalsUsed) * costScale);
    const upgradePrice = Math.round(50 * Math.pow(2, gameState.shopUpgradesUsed) * costScale);
    const canAffordRemoval = gameState.currency >= removalPrice;
    const canAffordUpgrade = gameState.currency >= upgradePrice;
    const upgradableCards = gameState.deckList.filter(c => !c.upgraded);

    const shopCards = gameState.shopInventory.filter(i => i.type === 'card');
    const shopRelics = gameState.shopInventory.filter(i => i.type === 'relic');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-6 rounded-lg max-w-4xl w-full shadow-2xl max-h-[95vh] overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-cyan-400">Shop — Floor {gameState.floor}</h2>
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

          {/* === CARDS SECTION === */}
          <div className="mb-4">
            <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider mb-2 border-b border-cyan-800 pb-1">Cards</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shopCards.map((item) => {
                const card = item.item as Card;
                const tags = cardKeywordTags(card);
                const isAffordable = gameState.currency >= item.price;
                return (
                  <div key={item.id} className={`border p-3 rounded-lg ${card.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : card.rarity === 'uncommon' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 bg-slate-800'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-slate-100 text-sm">{card.name}</h3>
                      <span className={`text-sm font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>{item.price}💰</span>
                    </div>
                    <p className="text-[10px] text-slate-400 capitalize mb-1">
                      <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · {card.cost >= 99 ? '✕' : card.cost}⚡
                    </p>
                    {tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-1">
                        {tags.map(t => (
                          <span key={t} className={`text-[8px] px-1 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 text-xs mb-1">
                      {card.damage > 0 && <span className="text-red-400">⚔{card.getEffectiveDamage()}{card.aoe ? ' AOE' : ''}</span>}
                      {card.shield > 0 && <span className="text-blue-400">🛡{card.getEffectiveShield()}</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 italic mb-2 line-clamp-2">{card.effect}</p>
                    <Button
                      onClick={() => onBuyItem?.(item.id)}
                      disabled={!isAffordable}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-bold py-1.5 rounded text-xs"
                    >
                      Buy
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* === RELICS SECTION === */}
          {shopRelics.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-orange-300 uppercase tracking-wider mb-2 border-b border-orange-800 pb-1">
                Relics {gameState.relicBoughtThisShop && <span className="text-slate-500 text-xs normal-case ml-2">(limit 1 per visit — purchased)</span>}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {shopRelics.map((item) => {
                  const relic = item.item as Relic;
                  const isAffordable = gameState.currency >= item.price && !gameState.relicBoughtThisShop;
                  const relicBorder = relic.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : relic.rarity === 'uncommon' ? 'border-orange-500 bg-orange-900/20' : 'border-yellow-600 bg-yellow-900/20';
                  return (
                    <div key={item.id} className={`border p-3 rounded-lg ${gameState.relicBoughtThisShop ? 'opacity-50' : ''} ${relicBorder}`}>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-slate-100 text-sm">🔮 {relic.name}</h3>
                        <span className={`text-sm font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>{item.price}💰</span>
                      </div>
                      <p className="text-[10px] text-slate-400 capitalize mb-1">{relic.rarity} Relic</p>
                      <p className="text-xs text-slate-300 mb-2">{relic.description}</p>
                      <Button
                        onClick={() => onBuyItem?.(item.id)}
                        disabled={!isAffordable}
                        className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 text-white font-bold py-1.5 rounded text-xs"
                      >
                        {gameState.relicBoughtThisShop ? 'Sold Out' : 'Buy'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* === SERVICES (Remove / Upgrade) === */}
          <div className="mb-4">
            <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-2 border-b border-emerald-800 pb-1">Services</h3>
            <div className="flex gap-3">
              {/* Remove Card Button */}
              <Button
                onClick={() => setSelectingCardToRemove(true)}
                disabled={!canAffordRemoval || gameState.deckList.length === 0}
                className="flex-1 bg-red-800/50 hover:bg-red-700/60 disabled:bg-slate-800 border border-red-500 disabled:border-slate-700 text-white font-bold py-3 rounded-lg text-sm"
              >
                <span className="block">🗑️ Remove Card</span>
                <span className={`text-xs ${canAffordRemoval ? 'text-yellow-400' : 'text-slate-500'}`}>{removalPrice}💰</span>
              </Button>
              {/* Upgrade Card Button */}
              <Button
                onClick={() => setSelectingCardToUpgrade(true)}
                disabled={!canAffordUpgrade || upgradableCards.length === 0}
                className="flex-1 bg-yellow-800/50 hover:bg-yellow-700/60 disabled:bg-slate-800 border border-yellow-500 disabled:border-slate-700 text-white font-bold py-3 rounded-lg text-sm"
              >
                <span className="block">⬆️ Upgrade Card</span>
                <span className={`text-xs ${canAffordUpgrade ? 'text-yellow-400' : 'text-slate-500'}`}>{upgradePrice}💰</span>
              </Button>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="flex gap-3">
            {onRefreshShop && gameState.shopRefreshesUsed < 2 && (
              <Button
                onClick={onRefreshShop}
                disabled={gameState.currency < Math.round(20 * costScale)}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg text-sm"
              >
                🔄 Refresh ({Math.round(20 * costScale)}💰) [{2 - gameState.shopRefreshesUsed} left]
              </Button>
            )}
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
                          {card.bleed ? <span className="text-red-400">🩸 Bleed {card.bleed}</span> : null}
                          {card.freeze ? <span className="text-blue-300">❄️ Freeze</span> : null}
                          {card.vulnerable ? <span className="text-orange-400">💥 Vulnerable {card.vulnerable}t</span> : null}
                          {card.weak ? <span className="text-yellow-400">😵 Weak {card.weak}t</span> : null}
                          {card.siphon ? <span className="text-teal-400">🔄 Siphon {card.siphon}</span> : null}
                          {card.multihit && card.multihit > 1 ? <span className="text-red-400">✕{card.multihit} hits</span> : null}
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
