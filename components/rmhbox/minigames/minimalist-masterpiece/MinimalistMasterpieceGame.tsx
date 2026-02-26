/**
 * Minimalist Masterpiece — Main Game Component
 *
 * Phase router that renders the appropriate sub-component based on
 * the current game phase: PROMPT_REVEAL, DRAWING, GALLERY, AUCTION, RESULTS.
 *
 * Subscribes to MM_* and TIMER_TICK events via socket GAME_ACTION.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.11
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { playSound } from '@/lib/rmhbox/audio';
import type { MinigameProps } from '../MinigameRenderer';
import DrawingCanvas from './DrawingCanvas';
import ColorPalette from './ColorPalette';
import StrokeCounter from './StrokeCounter';
import GalleryCarousel from './GalleryCarousel';
import AuctionPanel from './AuctionPanel';
import MarketResultsScreen from './MarketResultsScreen';
import type { MMStroke } from './DrawingCard';

// Type definitions for local state
interface GalleryDrawing {
  drawingId: string;
  label: string;
  strokes: MMStroke[];
  backgroundColor?: string;
}

interface AuctionDrawing extends GalleryDrawing {
  currentBidTotal: number;
  myBidAmount: number;
  isMine: boolean;
}

interface MMRanking {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  strokes: MMStroke[];
  backgroundColor?: string;
}

interface InvestmentBonus {
  userId: string;
  userName: string;
  bonusPoints: number;
  investedIn: string;
}

type MMPhase = 'PROMPT_REVEAL' | 'DRAWING' | 'GALLERY' | 'AUCTION' | 'RESULTS';

/** Helper: emit a game input action with the correct GameInputSchema shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// Background color preset options
const BG_COLORS = ['#ffffff', '#f5f5dc', '#ffe4e1', '#e0f7fa', '#f0e68c', '#e8e8e8', '#1a1a2e'];

// Stroke width slider range
const MIN_WIDTH = 1;
const MAX_WIDTH = 16;

export default function MinimalistMasterpieceGame({ playerId: _playerId, playerName: _playerName }: MinigameProps) {
  void _playerId;
  void _playerName;

  const [phase, setPhase] = useState<MMPhase>('PROMPT_REVEAL');
  const [prompt, setPrompt] = useState<string>('');
  const [maxStrokes, setMaxStrokes] = useState(5);
  const [colorPalette, setColorPalette] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState('#1a1a2e');
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [strokes, setStrokes] = useState<MMStroke[]>([]);
  const [editHistory, setEditHistory] = useState<MMStroke[][]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [galleryDrawings, setGalleryDrawings] = useState<GalleryDrawing[]>([]);
  const [auctionDrawings, setAuctionDrawings] = useState<AuctionDrawing[]>([]);
  const [currency, setCurrency] = useState(1000);
  const [rankings, setRankings] = useState<MMRanking[]>([]);
  const [investmentBonuses, setInvestmentBonuses] = useState<InvestmentBonus[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);

  /** Reset drawing state for a new round */
  const resetDrawingState = useCallback(() => {
    setStrokes([]);
    setEditHistory([]);
    setHasSubmitted(false);
    setBackgroundColor('#ffffff');
    setSelectedColor('#1a1a2e');
    setSelectedWidth(4);
  }, []);

  // Handle incoming game actions from the server
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'MM_PROMPT': {
          const promptData = data.prompt as { text: string };
          setPrompt(promptData.text);
          if (typeof data.maxStrokes === 'number') setMaxStrokes(data.maxStrokes as number);
          if (Array.isArray(data.colorPalette)) {
            const palette = data.colorPalette as string[];
            setColorPalette(palette);
            if (palette.length > 0) setSelectedColor(palette[0]);
          }
          // Clear canvas for new round
          resetDrawingState();
          setPhase('PROMPT_REVEAL');
          playSound('goFanfare');
          break;
        }
        case 'MM_DRAWING_START':
        case 'MM_DRAWING_PHASE': {
          if (typeof data.maxStrokes === 'number') setMaxStrokes(data.maxStrokes as number);
          setPhase('DRAWING');
          break;
        }
        case 'MM_DRAWING_ACCEPTED': {
          // Sent to the submitting player
          setHasSubmitted(true);
          playSound('click');
          break;
        }
        case 'MM_SUBMISSION_COUNT': {
          // Broadcast to all: { submitted, total }
          break;
        }
        case 'MM_GALLERY_START':
        case 'MM_GALLERY': {
          setGalleryDrawings(data.drawings as GalleryDrawing[]);
          setPhase('GALLERY');
          playSound('swoosh');
          break;
        }
        case 'MM_AUCTION_START': {
          setAuctionDrawings(data.drawings as AuctionDrawing[]);
          // Server sends 'currency', client previously expected 'startingCurrency'
          setCurrency((data.currency ?? data.startingCurrency) as number);
          setPhase('AUCTION');
          playSound('goFanfare');
          break;
        }
        case 'MM_BID_ACCEPTED': {
          // Sent to the bidder: { drawingId, myBidAmount, currency }
          const drawingId = data.drawingId as string;
          const myBidAmount = data.myBidAmount as number;
          setCurrency(data.currency as number);
          setAuctionDrawings((prev) =>
            prev.map((d) =>
              d.drawingId === drawingId
                ? { ...d, myBidAmount }
                : d,
            ),
          );
          playSound('click');
          break;
        }
        case 'MM_BID_UPDATE': {
          // Broadcast to all: { drawingId, currentBidTotal }
          const drawingId = data.drawingId as string;
          const total = (data.currentBidTotal ?? data.totalValue) as number;
          setAuctionDrawings((prev) =>
            prev.map((d) =>
              d.drawingId === drawingId
                ? { ...d, currentBidTotal: total }
                : d,
            ),
          );
          break;
        }
        case 'MM_BID_BROADCAST': {
          const drawingId = data.drawingId as string;
          const totalValue = data.totalValue as number;
          setAuctionDrawings((prev) =>
            prev.map((d) =>
              d.drawingId === drawingId
                ? { ...d, currentBidTotal: totalValue }
                : d,
            ),
          );
          break;
        }
        case 'MM_RESULTS': {
          setRankings(data.rankings as MMRanking[]);
          setInvestmentBonuses(data.investmentBonuses as InvestmentBonus[]);
          setPhase('RESULTS');
          playSound('victoryFanfare');
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }
      }
    },
    [resetDrawingState],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, handleGameAction);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
    };
  }, [handleGameAction]);

  // Hydrate from Zustand gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (p === 'PROMPT_REVEAL' || p === 'DRAWING' || p === 'GALLERY' || p === 'AUCTION' || p === 'RESULTS') {
      setPhase(p as MMPhase);
    }
    if (snapshot.prompt) {
      const pr = snapshot.prompt as { text: string } | string;
      setPrompt(typeof pr === 'string' ? pr : pr.text);
    }
    if (snapshot.maxStrokes) setMaxStrokes(snapshot.maxStrokes as number);
    if (Array.isArray(snapshot.colorPalette)) {
      setColorPalette(snapshot.colorPalette as string[]);
      if ((snapshot.colorPalette as string[]).length > 0) {
        setSelectedColor((snapshot.colorPalette as string[])[0]);
      }
    }
  }, []);

  const handleSubmitDrawing = useCallback(() => {
    if (hasSubmitted) return;
    emitGameInput('SUBMIT_DRAWING', { strokes, backgroundColor });
    setHasSubmitted(true);
  }, [hasSubmitted, strokes, backgroundColor]);

  // Undo: restore the previous edit history state
  const handleUndo = useCallback(() => {
    if (hasSubmitted || editHistory.length === 0) return;
    const prev = editHistory[editHistory.length - 1];
    setEditHistory((h) => h.slice(0, -1));
    setStrokes(prev);
  }, [hasSubmitted, editHistory]);

  // Track edit history: save state before each new stroke is added
  const trackingSetStrokes: React.Dispatch<React.SetStateAction<MMStroke[]>> = useCallback(
    (action) => {
      setStrokes((prevStrokes) => {
        const next = typeof action === 'function' ? action(prevStrokes) : action;
        if (next.length > prevStrokes.length) {
          setEditHistory((h) => [...h, prevStrokes]);
        }
        return next;
      });
    },
    [],
  );

  const handlePlaceBid = useCallback((drawingId: string, amount: number) => {
    emitGameInput('PLACE_BID', { drawingId, amount });
  }, []);

  // Render based on phase
  switch (phase) {
    case 'PROMPT_REVEAL':
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in">
          <h2 className="text-2xl font-bold text-(--rmhbox-text)">Draw:</h2>
          <p className="text-xl text-(--rmhbox-accent)">{prompt || 'Get ready...'}</p>
        </div>
      );

    case 'DRAWING':
      return (
        <div className="flex flex-col items-center gap-3 p-4">
          <p className="text-lg font-semibold text-(--rmhbox-text)">&quot;{prompt}&quot;</p>
          <DrawingCanvas
            strokes={strokes}
            setStrokes={trackingSetStrokes}
            selectedColor={selectedColor}
            selectedWidth={selectedWidth}
            backgroundColor={backgroundColor}
            maxStrokes={maxStrokes}
            hasSubmitted={hasSubmitted}
            onSubmit={handleSubmitDrawing}
            onUndo={handleUndo}
          />

          {/* Stroke color: palette swatches + color picker */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs text-(--rmhbox-text-muted)">Color:</span>
            <ColorPalette
              colors={colorPalette}
              selectedColor={selectedColor}
              onSelect={setSelectedColor}
            />
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-8 h-8 rounded-full border border-(--rmhbox-border) cursor-pointer p-0 bg-transparent"
              title="Custom stroke color"
              aria-label="Custom stroke color"
            />
          </div>

          {/* Stroke width slider */}
          <div className="flex items-center gap-2 w-64">
            <span className="text-xs text-(--rmhbox-text-muted)">Width:</span>
            <input
              type="range"
              min={MIN_WIDTH}
              max={MAX_WIDTH}
              step={1}
              value={selectedWidth}
              onChange={(e) => setSelectedWidth(Number(e.target.value))}
              className="flex-1 accent-(--rmhbox-accent)"
              aria-label="Stroke width"
            />
            <span
              className="flex items-center justify-center w-8 h-8"
              title={`Width: ${selectedWidth}px`}
            >
              <span
                className="rounded-full"
                style={{
                  width: `${Math.min(selectedWidth * 2, 24)}px`,
                  height: `${Math.min(selectedWidth * 2, 24)}px`,
                  backgroundColor: selectedColor,
                }}
              />
            </span>
          </div>

          {/* Background color: preset swatches + color picker */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs text-(--rmhbox-text-muted)">Background:</span>
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBackgroundColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  backgroundColor === c
                    ? 'border-(--rmhbox-accent) scale-110 ring-2 ring-(--rmhbox-accent)/40'
                    : 'border-(--rmhbox-border) hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Background color ${c}`}
              />
            ))}
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="w-6 h-6 rounded-full border border-(--rmhbox-border) cursor-pointer p-0 bg-transparent"
              title="Custom background color"
              aria-label="Custom background color"
            />
          </div>

          <div className="flex items-center gap-4">
            <StrokeCounter current={strokes.length} max={maxStrokes} />
            {!hasSubmitted && (
              <button
                className="px-4 py-2 rounded-lg bg-(--rmhbox-accent) text-white font-semibold"
                onClick={handleSubmitDrawing}
              >
                Submit Drawing
              </button>
            )}
            {hasSubmitted && (
              <span className="text-sm text-(--rmhbox-text-muted)">Drawing submitted ✓</span>
            )}
          </div>
        </div>
      );

    case 'GALLERY':
      return (
        <div className="flex flex-col items-center gap-4 p-4">
          <h2 className="text-xl font-bold text-(--rmhbox-text)">Gallery Walk</h2>
          <p className="text-sm text-(--rmhbox-text-muted)">Prompt: &quot;{prompt}&quot;</p>
          <GalleryCarousel drawings={galleryDrawings} />
        </div>
      );

    case 'AUCTION':
      return (
        <div className="flex flex-col items-center gap-4 p-4">
          <h2 className="text-xl font-bold text-(--rmhbox-text)">Auction Phase</h2>
          <p className="text-sm text-(--rmhbox-text-muted)">
            Remaining: {currency} coins • Time: {timeRemaining}s
          </p>
          <AuctionPanel
            drawings={auctionDrawings}
            currency={currency}
            onBid={handlePlaceBid}
          />
        </div>
      );

    case 'RESULTS':
      return (
        <MarketResultsScreen
          rankings={rankings}
          investmentBonuses={investmentBonuses}
          prompt={prompt}
        />
      );

    default:
      return null;
  }
}
