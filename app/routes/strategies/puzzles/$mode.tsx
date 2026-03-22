/**
 * Individual Puzzle Mode Page
 *
 * Tung Tung Tung Doctrine: The puzzle is immediately visible and playable.
 * No splash screen. No "how to play" modal on first visit. It hits you like a bat.
 *
 * Supports daily puzzles (full XP) and replays (reduced XP, random puzzles).
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { ArrowLeft, RotateCcw, ArrowUpDown, GripVertical } from 'lucide-react';
import { PuzzleShell } from '@/components/doctrine/puzzles/puzzle-shell';
import { ResultCard } from '@/components/doctrine/puzzles/result-card';
import { useDoctrinePuzzleState } from '@/hooks/useDoctrinePuzzleState';
import { useDoctrineSound } from '@/hooks/useDoctrineSound';

export const Route = createFileRoute('/strategies/puzzles/$mode')({
  component: PuzzleModePage,
});

type PuzzleData = {
  id: string;
  difficulty: number;
  resetsAt: string;
  data: unknown;
};

function PuzzleModePage() {
  const params = Route.useParams() as { mode: string };
  const mode = params.mode;
  const [replayPuzzle, setReplayPuzzle] = useState<PuzzleData | null>(null);
  const [replayKey, setReplayKey] = useState(0);

  const { data: puzzles } = useQuery({
    queryKey: ['doctrine', 'puzzles', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/puzzles/today');
      return res.json();
    },
    staleTime: 60_000,
  });

  const dailyPuzzle = puzzles?.find((p: { mode: string }) => p.mode.toLowerCase() === mode);
  const activePuzzle = replayPuzzle ?? dailyPuzzle;

  const handlePlayAgain = useCallback(async () => {
    try {
      const res = await fetch(`/api/doctrine/puzzles/replay?mode=${mode}`);
      if (!res.ok) throw new Error('Failed to load replay');
      const data = await res.json();
      setReplayPuzzle(data);
      setReplayKey(k => k + 1);
    } catch {
      // Fallback: reload daily
      setReplayPuzzle(null);
      setReplayKey(k => k + 1);
    }
  }, [mode]);

  if (!activePuzzle) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--doctrine-bg-primary)' }}>
        <p className="text-sm text-white/40">Loading puzzle...</p>
      </div>
    );
  }

  return (
    <PuzzlePlayer
      key={`${activePuzzle.id}-${replayKey}`}
      puzzle={activePuzzle}
      mode={mode}
      isReplay={!!replayPuzzle}
      onPlayAgain={handlePlayAgain}
    />
  );
}

function PuzzlePlayer({
  puzzle,
  mode,
  isReplay,
  onPlayAgain,
}: {
  puzzle: PuzzleData;
  mode: string;
  isReplay: boolean;
  onPlayAgain: () => void;
}) {
  const queryClient = useQueryClient();
  const { phase, result, error, attempts, startPlaying, submit, reset } = useDoctrinePuzzleState(puzzle.id, isReplay);
  const { playTung, playSuccess } = useDoctrineSound();
  const [selectedAnswer, setSelectedAnswer] = useState<unknown>(null);

  // Auto-start playing
  if (phase === 'loading') {
    startPlaying();
  }

  const handleSubmit = useCallback(async () => {
    if (selectedAnswer === null) return;
    playTung();
    const res = await submit(selectedAnswer);
    if (res?.correct) {
      playSuccess();
      // Invalidate leaderboard + reputation caches
      queryClient.invalidateQueries({ queryKey: ['doctrine', 'leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['doctrine', 'reputation'] });
    }
  }, [selectedAnswer, submit, playTung, playSuccess, queryClient]);

  const handlePlayAgain = useCallback(() => {
    setSelectedAnswer(null);
    reset();
    onPlayAgain();
  }, [reset, onPlayAgain]);

  const resetsAt = new Date(puzzle.resetsAt);
  const data = puzzle.data as Record<string, unknown>;

  return (
    <PuzzleShell mode={mode} difficulty={puzzle.difficulty} resetsAt={resetsAt} attempts={attempts} phase={phase} isReplay={isReplay}>
      <div className="w-full max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Render puzzle content based on mode */}
        {phase !== 'complete' && phase !== 'expired' && (
          <PuzzleContent mode={mode} data={data} onAnswer={setSelectedAnswer} />
        )}

        {/* Submit button */}
        {phase === 'playing' && selectedAnswer !== null && (
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-lg text-base md:text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98] min-h-11"
            style={{ background: 'var(--doctrine-accent, #F97316)', color: '#000' }}
          >
            SUBMIT
          </button>
        )}

        {phase === 'submitting' && (
          <div className="text-center text-sm text-white/40">Submitting...</div>
        )}

        {/* Result card */}
        {phase === 'complete' && result && (
          <>
            <ResultCard
              mode={mode}
              correct={result.correct}
              score={result.score}
              timeMs={0}
              attempts={attempts}
              difficulty={puzzle.difficulty}
              date={new Date().toISOString().slice(0, 10)}
              isReplay={isReplay}
            />
            <div className="flex gap-3">
              <Link
                to="/strategies/puzzles"
                className="flex-1 py-3 rounded-lg text-base md:text-sm font-medium flex items-center justify-center gap-2 min-h-11 transition-colors hover:bg-white/10"
                style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--doctrine-text-primary, #fff)' }}
              >
                <ArrowLeft size={16} />
                Back to Puzzles
              </Link>
              <button
                onClick={handlePlayAgain}
                className="flex-1 py-3 rounded-lg text-base md:text-sm font-medium flex items-center justify-center gap-2 min-h-11 transition-all hover:brightness-110"
                style={{ background: 'var(--doctrine-accent, #F97316)', color: '#000' }}
              >
                <RotateCcw size={16} />
                Play Again
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-center" style={{ color: 'var(--doctrine-error)' }}>{error}</p>
        )}

        {phase === 'expired' && (
          <div className="text-center py-8 space-y-4">
            <p className="text-lg font-bold text-white/60">Time's Up</p>
            <p className="text-sm text-white/30 mt-1">This puzzle has expired.</p>
            <button
              onClick={handlePlayAgain}
              className="px-6 py-3 rounded-lg text-base md:text-sm font-medium min-h-11 transition-all hover:brightness-110"
              style={{ background: 'var(--doctrine-accent, #F97316)', color: '#000' }}
            >
              <RotateCcw size={16} className="inline mr-2" />
              Play a New Puzzle
            </button>
          </div>
        )}
      </div>
    </PuzzleShell>
  );
}

function PuzzleContent({ mode, data, onAnswer }: { mode: string; data: Record<string, unknown>; onAnswer: (answer: unknown) => void }) {
  switch (mode) {
    case 'alibi': return <AlibiPuzzle data={data} onAnswer={onAnswer} />;
    case 'outcast': return <OutcastPuzzle data={data} onAnswer={onAnswer} />;
    case 'impostor': return <ImpostorPuzzle data={data} onAnswer={onAnswer} />;
    case 'spectrum': return <SpectrumPuzzle data={data} onAnswer={onAnswer} />;
    case 'chainlink': return <ChainlinkPuzzle data={data} onAnswer={onAnswer} />;
    default: return <GenericPuzzle />;
  }
}

// ─── Alibi ──────────────────────────────────────────────────────────────────

function AlibiPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const suspects = data.suspects as Array<{ name: string; claim: string }>;
  const evidence = data.evidence as string | undefined;
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-base md:text-sm text-white/60 text-center">Who's lying? Tap the suspect whose alibi is contradicted.</p>
      {evidence && (
        <div className="p-3 rounded-lg text-sm md:text-xs text-amber-300/80 text-center leading-relaxed"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
          {evidence}
        </div>
      )}
      <div className="space-y-2">
        {suspects?.map(s => (
          <button
            key={s.name}
            onClick={() => { setSelected(s.name); onAnswer(s.name); }}
            className={`w-full text-left p-4 md:p-3 rounded-lg transition-all min-h-11 ${
              selected === s.name ? 'ring-2' : 'hover:bg-white/5'
            }`}
            style={{
              background: selected === s.name ? 'var(--doctrine-accent-muted)' : 'var(--doctrine-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
              outlineColor: 'var(--doctrine-accent)',
            }}
          >
            <span className="text-base md:text-sm font-semibold text-white/90">{s.name}</span>
            <p className="text-sm md:text-xs text-white/50 mt-0.5">"{s.claim}"</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Outcast ────────────────────────────────────────────────────────────────

function OutcastPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const words = data.words as string[];
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-base md:text-sm text-white/60 text-center">Which word doesn't belong?</p>
      <div className="flex flex-wrap justify-center gap-2">
        {words?.map(w => (
          <button
            key={w}
            onClick={() => { setSelected(w); onAnswer(w); }}
            className={`px-4 py-3 md:py-2 rounded-lg text-base md:text-sm font-medium transition-all min-h-11 ${
              selected === w ? 'ring-2' : 'hover:bg-white/10'
            }`}
            style={{
              background: selected === w ? 'var(--doctrine-accent-muted)' : 'var(--doctrine-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Impostor ───────────────────────────────────────────────────────────────

function ImpostorPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const pairs = data.pairs as Array<{ word: string; definition: string }>;
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-base md:text-sm text-white/60 text-center">Which word has the wrong definition?</p>
      <div className="space-y-2">
        {pairs?.map(p => (
          <button
            key={p.word}
            onClick={() => { setSelected(p.word); onAnswer(p.word); }}
            className={`w-full text-left p-4 md:p-3 rounded-lg transition-all min-h-11 ${
              selected === p.word ? 'ring-2' : 'hover:bg-white/5'
            }`}
            style={{
              background: selected === p.word ? 'var(--doctrine-accent-muted)' : 'var(--doctrine-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span className="text-base md:text-sm font-bold text-white/90">{p.word}</span>
            <p className="text-sm md:text-xs text-white/50 mt-0.5">{p.definition}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Spectrum (drag-to-reorder) ─────────────────────────────────────────────

function SpectrumPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const low = data.low as string;
  const high = data.high as string;
  const initialItems = data.items as string[];
  const [items, setItems] = useState<string[]>(initialItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    onAnswer(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-base md:text-sm text-white/60 text-center">
        <ArrowUpDown size={14} className="inline mr-1" />
        Order these items from <strong className="text-white/80">{low}</strong> to <strong className="text-white/80">{high}</strong>
      </p>

      {/* Spectrum endpoints */}
      <div className="flex justify-between text-xs font-mono text-white/30 px-2">
        <span>{low}</span>
        <span>{high}</span>
      </div>

      {/* Sortable list */}
      <div className="space-y-1.5">
        {items.map((word, i) => (
          <div
            key={word}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={() => { if (dragIndex !== null && dragIndex !== i) moveItem(dragIndex, i); setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-3 p-3 md:p-2.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-all min-h-11 ${
              dragIndex === i ? 'opacity-50 scale-95' : ''
            }`}
            style={{
              background: 'var(--doctrine-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <GripVertical size={16} className="text-white/20 shrink-0" />
            <span className="text-base md:text-sm font-medium text-white/90 flex-1">{word}</span>
            <span className="text-xs font-mono text-white/20 shrink-0">{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Tap-to-swap for mobile: select two items to swap */}
      <p className="text-xs text-white/20 text-center md:hidden">Drag items to reorder, or tap two items to swap</p>
    </div>
  );
}

// ─── Chainlink (reorder middle words) ───────────────────────────────────────

function ChainlinkPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const start = data.start as string;
  const end = data.end as string;
  const scrambled = data.scrambled as string[];
  const [middle, setMiddle] = useState<string[]>(scrambled);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    const next = [...middle];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setMiddle(next);
    onAnswer([start, ...next, end]);
  };

  // Emit answer on mount with initial order
  useState(() => { onAnswer([start, ...scrambled, end]); });

  return (
    <div className="space-y-4">
      <p className="text-base md:text-sm text-white/60 text-center">
        Build the chain! Reorder the middle words to connect <strong className="text-white/80">{start}</strong> to <strong className="text-white/80">{end}</strong>.
      </p>

      {/* Fixed start */}
      <div
        className="flex items-center gap-3 p-3 md:p-2.5 rounded-lg min-h-11"
        style={{ background: 'var(--doctrine-accent-muted)', border: '1px solid var(--doctrine-accent, #F97316)' }}
      >
        <span className="text-base md:text-sm font-bold" style={{ color: 'var(--doctrine-accent)' }}>{start}</span>
        <span className="text-xs font-mono text-white/30 ml-auto">START</span>
      </div>

      {/* Draggable middle */}
      <div className="space-y-1.5">
        {middle.map((word, i) => (
          <div
            key={word}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={() => { if (dragIndex !== null && dragIndex !== i) moveItem(dragIndex, i); setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-3 p-3 md:p-2.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-all min-h-11 ${
              dragIndex === i ? 'opacity-50 scale-95' : ''
            }`}
            style={{
              background: 'var(--doctrine-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <GripVertical size={16} className="text-white/20 shrink-0" />
            <span className="text-base md:text-sm font-medium text-white/90 flex-1">{word}</span>
          </div>
        ))}
      </div>

      {/* Fixed end */}
      <div
        className="flex items-center gap-3 p-3 md:p-2.5 rounded-lg min-h-11"
        style={{ background: 'var(--doctrine-accent-muted)', border: '1px solid var(--doctrine-accent, #F97316)' }}
      >
        <span className="text-base md:text-sm font-bold" style={{ color: 'var(--doctrine-accent)' }}>{end}</span>
        <span className="text-xs font-mono text-white/30 ml-auto">END</span>
      </div>
    </div>
  );
}

// ─── Generic fallback ───────────────────────────────────────────────────────

function GenericPuzzle() {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-white/40">Puzzle mode not yet implemented.</p>
      <p className="text-xs text-white/20 mt-1">Check back soon.</p>
    </div>
  );
}
