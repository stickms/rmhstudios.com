/**
 * SignalForgeUI.tsx — Signal Forge UI router (slim orchestrator)
 * ──────────────────────────────────────────────────────────────
 * Renders the correct overlay / screen based on the current game phase.
 * All phase-specific rendering is delegated to dedicated sub-components
 * in components/signal-forge/ui/. This file handles shared local state
 * (modals, collection viewer) and the Escape-key pause toggle.
 */

'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, RelicTemplate } from '@/lib/signal-forge';
import type { GameState } from '@/lib/signal-forge/GameTypes';

// UI sub-components
import { LandingScreen } from './ui/LandingScreen';
import { PauseMenu } from './ui/PauseMenu';
import { StarterRelicScreen } from './ui/StarterRelicScreen';
import { EventScreen } from './ui/EventScreen';
import { RestOrShopScreen } from './ui/RestOrShopScreen';
import { VictoryScreen } from './ui/VictoryScreen';
import { CardRemovalModal, CardUpgradeModal } from './ui/CardModals';
import { MulliganOverlay } from './ui/MulliganOverlay';
import { DeckViewer } from './ui/DeckViewer';
import { OverwriterPenOverlay } from './ui/OverwriterPenOverlay';
import { CombatHUD } from './ui/CombatHUD';
import { CardRewardScreen } from './ui/CardRewardScreen';
import { ShopScreen } from './ui/ShopScreen';
import { GameOverScreen } from './ui/GameOverScreen';
import { CollectionModal } from './ui/CollectionModal';

// ─── Props ───────────────────────────────────────────────────────────

export interface SignalForgeUIProps {
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

// ─── Component ───────────────────────────────────────────────────────

export function SignalForgeUI(props: SignalForgeUIProps) {
  const {
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
  } = props;

  /* ── Local UI state ── */
  const { t } = useTranslation("c-signal-forge");
  const [showCollection, setShowCollection] = useState(false);
  const [selectingCardToRemove, setSelectingCardToRemove] = useState(false);
  const [selectingCardToUpgrade, setSelectingCardToUpgrade] = useState(false);
  const [showPauseMenuLocal, setShowPauseMenuLocal] = useState(false);
  const showPauseMenu = showPauseMenuProp ?? showPauseMenuLocal;
  const setShowPauseMenu = setShowPauseMenuProp ?? setShowPauseMenuLocal;

  /* ── Escape key handler ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gameState.phase !== 'landing' && gameState.phase !== 'game-over') {
        // If the deck/discard viewer is open, DeckViewer handles its own Escape — skip here
        if (gameState.viewingPile) return;
        setShowPauseMenu(!showPauseMenu);
        setShowCollection(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.phase, gameState.viewingPile, showPauseMenu, setShowPauseMenu]);

  /* ── Phase routing ── */

  // Landing screen
  if (gameState.phase === 'landing') {
    return (
      <LandingScreen
        onStartGame={onStartGame}
        hasSavedRun={hasSavedRun}
        onLoadSavedRun={onLoadSavedRun}
      />
    );
  }

  // Pause menu (shown over any active phase)
  if (showPauseMenu) {
    return (
      <PauseMenu
        onClose={() => setShowPauseMenu(false)}
        onAbandonRun={onAbandonRun}
        onReturnToLanding={onReturnToLanding}
      />
    );
  }

  // Collection modal (accessible from any phase)
  if (showCollection) {
    return <CollectionModal gameState={gameState} onClose={() => setShowCollection(false)} />;
  }

  // Starter relic choice
  if (gameState.phase === 'starter-relic' && onSelectStarterRelic) {
    return (
      <StarterRelicScreen
        choices={gameState.starterRelicChoices}
        floor={gameState.floor}
        onSelect={onSelectStarterRelic}
      />
    );
  }

  // Event
  if (gameState.phase === 'event' && gameState.currentEvent && onResolveEvent) {
    return <EventScreen event={gameState.currentEvent} onResolve={onResolveEvent} />;
  }

  // Rest or shop
  if (gameState.phase === 'rest-or-shop' && onChooseRest && onChooseShop) {
    return (
      <RestOrShopScreen
        floor={gameState.floor}
        playerHp={gameState.playerHp}
        playerMaxHp={gameState.playerMaxHp}
        onChooseRest={onChooseRest}
        onChooseShop={onChooseShop}
      />
    );
  }

  // Victory / reward
  if (gameState.phase === 'reward') {
    return (
      <VictoryScreen
        floor={gameState.floor}
        score={gameState.score}
        currency={gameState.currency}
        defeatedBossName={gameState.defeatedBossName}
        ownedRelics={gameState.ownedRelics}
        onNextFloor={onNextFloor}
      />
    );
  }

  // Card removal modal (from shop services)
  if (selectingCardToRemove && gameState.deckList.length > 0) {
    const costScale = 1 + (gameState.floor - 1) * 0.08;
    const removalPrice = Math.round(50 * Math.pow(2, gameState.shopRemovalsUsed) * costScale);
    return (
      <CardRemovalModal
        deckList={gameState.deckList}
        removalCurrency={removalPrice}
        canRemove={gameState.currency >= removalPrice}
        onRemove={(cardId) => { onRemoveCard?.(cardId); setSelectingCardToRemove(false); }}
        onClose={() => setSelectingCardToRemove(false)}
      />
    );
  }

  // Card upgrade modal (from shop services)
  if (selectingCardToUpgrade && gameState.deckList.length > 0) {
    const costScale = 1 + (gameState.floor - 1) * 0.08;
    const upgradePrice = Math.round(50 * Math.pow(2, gameState.shopUpgradesUsed) * costScale);
    return (
      <CardUpgradeModal
        deckList={gameState.deckList}
        upgradeCurrency={upgradePrice}
        canUpgrade={gameState.currency >= upgradePrice}
        onUpgrade={(cardId) => { onUpgradeCard?.(cardId); setSelectingCardToUpgrade(false); }}
        onClose={() => setSelectingCardToUpgrade(false)}
      />
    );
  }

  // Mulligan overlay (combat start)
  if (gameState.phase === 'combat' && gameState.mulliganAvailable && onToggleMulliganCard && onConfirmMulligan) {
    return (
      <MulliganOverlay
        selectedCount={gameState.mulliganSelected.length}
        onConfirm={onConfirmMulligan}
      />
    );
  }

  // Deck/discard viewer
  if (gameState.phase === 'combat' && gameState.viewingPile && onToggleViewPile) {
    const cards = gameState.viewingPile === 'deck' ? gameState.deck : gameState.discard;
    const label = gameState.viewingPile === 'deck' ? t("draw-pile", { defaultValue: "Draw Pile" }) : t("discard-pile", { defaultValue: "Discard Pile" });
    return <DeckViewer cards={cards} pileLabel={label} onClose={() => onToggleViewPile(null)} />;
  }

  // Overwriter's Pen overlay
  if (
    gameState.phase === 'combat' &&
    gameState.overwriterPenTarget !== null &&
    onCancelOverwriterPen &&
    onConfirmOverwriterPen &&
    onActivateOverwriterPen
  ) {
    return (
      <OverwriterPenOverlay
        hand={gameState.hand}
        deckList={gameState.deckList}
        overwriterPenTarget={gameState.overwriterPenTarget}
        onActivate={onActivateOverwriterPen}
        onConfirm={onConfirmOverwriterPen}
        onCancel={onCancelOverwriterPen}
      />
    );
  }

  // Combat HUD (deck/discard/sort/pen buttons)
  if (gameState.phase === 'combat' && !gameState.mulliganAvailable) {
    return (
      <CombatHUD
        deckCount={gameState.deck.length}
        discardCount={gameState.discard.length}
        handSortMode={gameState.handSortMode}
        hand={gameState.hand}
        ownedRelics={gameState.ownedRelics}
        overwriterPenUsed={gameState.overwriterPenUsed}
        onToggleViewPile={onToggleViewPile}
        onCycleSortMode={onCycleSortMode}
        onActivateOverwriterPen={onActivateOverwriterPen}
      />
    );
  }

  // Card reward screen
  if (gameState.phase === 'card-reward' && onSelectCardReward && onSkipCardReward) {
    return (
      <CardRewardScreen
        choices={gameState.cardRewardChoices}
        onSelect={onSelectCardReward}
        onSkip={onSkipCardReward}
      />
    );
  }

  // Shop screen
  if (gameState.phase === 'shop' && !showCollection) {
    return (
      <ShopScreen
        gameState={gameState}
        onBuyItem={onBuyItem}
        onProceedFromShop={onProceedFromShop}
        onRefreshShop={onRefreshShop}
        onOpenRemoval={() => setSelectingCardToRemove(true)}
        onOpenUpgrade={() => setSelectingCardToUpgrade(true)}
        onOpenCollection={() => setShowCollection(true)}
      />
    );
  }

  // Game over
  if (gameState.phase === 'game-over') {
    return (
      <GameOverScreen
        score={gameState.score}
        floor={gameState.floor}
        onReturnToLanding={onReturnToLanding}
      />
    );
  }

  // Default fallback — collection button
  return (
    <div className="w-full h-full pointer-events-none">
      <button
        onClick={() => setShowCollection(true)}
        className="fixed bottom-6 left-6 pointer-events-auto bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-lg border border-cyan-400 shadow-lg transition-all"
      >
        📚 {t("collection", { defaultValue: "Collection" })}
      </button>
    </div>
  );
}
