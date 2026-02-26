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

import { useState, useEffect, useCallback, useRef } from 'react';
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

/** Per-player score breakdown for the new auction/scoring model */
interface PlayerScoreBreakdown {
  userId: string;
  userName: string;
  /** Market values of paintings they painted (artist credit) */
  paintedValue: number;
  /** Market values of paintings they won in auction */
  ownedValue: number;
  /** Penalty for overbidding: 0.5 × (winnerBid - secondHighestBid) */
  overbidPenalty: number;
  /** Total score = paintedValue + ownedValue - overbidPenalty */
  totalScore: number;
}

type MMPhase = 'PROMPT_REVEAL' | 'DRAWING' | 'GALLERY' | 'AUCTION' | 'RESULTS';

/** Helper: emit a game input action with the correct GameInputSchema shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// Default color palette (fallback if server hasn't sent one yet)
const DEFAULT_COLOR_PALETTE = ['#1a1a2e', '#e94560', '#0f3460', '#16213e', '#533483', '#2b9348', '#fca311'];

// Background color preset options
const BG_COLORS = ['#ffffff', '#f5f5dc', '#ffe4e1', '#e0f7fa', '#f0e68c', '#e8e8e8', '#1a1a2e'];

// Stroke width slider range (SVG viewBox is 300×300, so max ≈ half-canvas = 150)
const MIN_WIDTH = 1;
const MAX_WIDTH = 150;

/** Check if a hex color is "light" (luminance > 0.5) for contrast purposes. */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
}

export default function MinimalistMasterpieceGame({ playerId: _playerId, playerName: _playerName }: MinigameProps) {
  void _playerId;
  void _playerName;

  const [phase, setPhase] = useState<MMPhase>('PROMPT_REVEAL');
  const [prompt, setPrompt] = useState<string>('');
  const [maxStrokes, setMaxStrokes] = useState(5);
  const [colorPalette, setColorPalette] = useState<string[]>(DEFAULT_COLOR_PALETTE);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR_PALETTE[0]);
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [strokes, setStrokes] = useState<MMStroke[]>([]);
  const [editHistory, setEditHistory] = useState<MMStroke[][]>([]);
  const [galleryDrawings, setGalleryDrawings] = useState<GalleryDrawing[]>([]);
  const [auctionDrawings, setAuctionDrawings] = useState<AuctionDrawing[]>([]);
  const [currency, setCurrency] = useState(1000);
  const [rankings, setRankings] = useState<MMRanking[]>([]);
  const [scoreBreakdowns, setScoreBreakdowns] = useState<PlayerScoreBreakdown[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Auto-submit: track whether we've auto-submitted
  const autoSubmittedRef = useRef(false);

  /** Reset drawing state for a new round */
  const resetDrawingState = useCallback(() => {
    setStrokes([]);
    setEditHistory([]);
    setBackgroundColor('#ffffff');
    setSelectedColor(colorPalette[0] ?? DEFAULT_COLOR_PALETTE[0]);
    setSelectedWidth(4);
    autoSubmittedRef.current = false;
  }, [colorPalette]);

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
          if (Array.isArray(data.colorPalette)) {
            const palette = data.colorPalette as string[];
            setColorPalette(palette);
          }
          setPhase('DRAWING');
          break;
        }
        case 'MM_DRAWING_ACCEPTED': {
          // Sent to the submitting player — Auto-save acknowledged
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
          if (Array.isArray(data.scoreBreakdowns)) {
            setScoreBreakdowns(data.scoreBreakdowns as PlayerScoreBreakdown[]);
          }
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
      const palette = snapshot.colorPalette as string[];
      setColorPalette(palette);
      if (palette.length > 0) {
        setSelectedColor(palette[0]);
      }
    }
  }, []);

  // Auto-save: whenever strokes or backgroundColor changes during the DRAWING phase,
  // automatically submit the drawing to the server. Always runs (server allows re-submissions).
  useEffect(() => {
    if (phase !== 'DRAWING') return;
    // Debounce auto-submit to avoid spamming on rapid changes
    const timeout = setTimeout(() => {
      emitGameInput('SUBMIT_DRAWING', { strokes, backgroundColor });
    }, 500);
    return () => clearTimeout(timeout);
  }, [phase, strokes, backgroundColor]);

  // Undo: restore the previous edit history state.
  // Auto-save allows re-submissions, so undo works throughout the drawing phase.
  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return;
    const prev = editHistory[editHistory.length - 1];
    setEditHistory((h) => h.slice(0, -1));
    setStrokes(prev);
  }, [editHistory]);

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
            onSubmit={() => {}}
            onUndo={handleUndo}
          />

          {/* Stroke color: palette swatches + react-colorful picker */}
          <ColorPalette
            colors={colorPalette}
            selectedColor={selectedColor}
            onSelect={setSelectedColor}
            label="Color:"
          />

          {/* Stroke width slider */}
          <div className="flex items-center gap-2 w-full max-w-72">
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
            {/* Preview: shows a colored dot scaled to the actual rendered width.
                When the dot exceeds 36px, display the numerical width instead.
                Contrasting circular background for visibility in all themes. */}
            {(() => {
              const scaledWidth = selectedWidth * (288 / 300);
              const showNumber = scaledWidth > 36;
              const contrastBg = isLightColor(selectedColor) ? '#333' : '#eee';
              const contrastText = isLightColor(selectedColor) ? '#eee' : '#333';
              return (
                <span
                  className="flex items-center justify-center rounded-full border border-(--rmhbox-border)"
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: contrastBg,
                  }}
                  title={`Width: ${selectedWidth}`}
                >
                  {showNumber ? (
                    <span
                      className="text-xs font-bold"
                      style={{ color: contrastText }}
                    >
                      {selectedWidth}
                    </span>
                  ) : (
                    <span
                      className="rounded-full"
                      style={{
                        width: `${Math.min(scaledWidth, 36)}px`,
                        height: `${Math.min(scaledWidth, 36)}px`,
                        backgroundColor: selectedColor,
                      }}
                    />
                  )}
                </span>
              );
            })()}
          </div>

          {/* Background color: preset swatches + react-colorful picker */}
          <ColorPalette
            colors={BG_COLORS}
            selectedColor={backgroundColor}
            onSelect={setBackgroundColor}
            swatchSize="w-6 h-6"
            label="Background:"
          />

          <div className="flex items-center gap-4">
            <StrokeCounter current={strokes.length} max={maxStrokes} />
            <span className="text-xs text-(--rmhbox-text-muted)">
              Auto-saving • {timeRemaining}s
            </span>
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
          scoreBreakdowns={scoreBreakdowns}
          prompt={prompt}
        />
      );

    default:
      return null;
  }
}
