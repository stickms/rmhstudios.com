/**
 * Individual Puzzle Mode Page
 *
 * Tung Tung Tung Doctrine: The puzzle is immediately visible and playable.
 * No splash screen. No "how to play" modal on first visit. It hits you like a bat.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { PuzzleShell } from '@/components/doctrine/puzzles/puzzle-shell';
import { ResultCard } from '@/components/doctrine/puzzles/result-card';
import { useDoctrinePuzzleState } from '@/hooks/useDoctrinePuzzleState';
import { useDoctrineSound } from '@/hooks/useDoctrineSound';

export const Route = createFileRoute('/strategies/puzzles/$mode')({
  component: PuzzleModePage,
});

function PuzzleModePage() {
  const params = Route.useParams() as { mode: string };
  const mode = params.mode;

  const { data: puzzles } = useQuery({
    queryKey: ['doctrine', 'puzzles', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/puzzles/today');
      return res.json();
    },
    staleTime: 60_000,
  });

  const puzzle = puzzles?.find((p: { mode: string }) => p.mode.toLowerCase() === mode);

  if (!puzzle) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--doctrine-bg-primary)' }}>
        <p className="text-sm text-white/40">Loading puzzle...</p>
      </div>
    );
  }

  return <PuzzlePlayer puzzle={puzzle} mode={mode} />;
}

function PuzzlePlayer({ puzzle, mode }: { puzzle: { id: string; difficulty: number; resetsAt: string; data: unknown }; mode: string }) {
  const { phase, result, error, attempts, startPlaying, submit } = useDoctrinePuzzleState(puzzle.id);
  const { playTung, playSuccess } = useDoctrineSound();
  const [selectedAnswer, setSelectedAnswer] = useState<unknown>(null);

  // Auto-start playing
  if (phase === 'loading') {
    startPlaying();
  }

  const handleSubmit = useCallback(async () => {
    if (selectedAnswer === null) return;
    playTung();
    await submit(selectedAnswer);
    if (result?.correct) playSuccess();
  }, [selectedAnswer, submit, playTung, playSuccess, result]);

  const resetsAt = new Date(puzzle.resetsAt);
  const data = puzzle.data as Record<string, unknown>;

  return (
    <PuzzleShell mode={mode} difficulty={puzzle.difficulty} resetsAt={resetsAt} attempts={attempts} phase={phase}>
      <div className="w-full max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Render puzzle content based on mode */}
        {phase !== 'complete' && phase !== 'expired' && (
          <PuzzleContent mode={mode} data={data} onAnswer={setSelectedAnswer} />
        )}

        {/* Submit button */}
        {phase === 'playing' && selectedAnswer !== null && (
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-lg text-base md:text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98] min-h-[44px]"
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
          <ResultCard
            mode={mode}
            correct={result.correct}
            score={result.score}
            timeMs={0}
            attempts={attempts}
            difficulty={puzzle.difficulty}
            date={new Date().toISOString().slice(0, 10)}
          />
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-center" style={{ color: 'var(--doctrine-error)' }}>{error}</p>
        )}

        {phase === 'expired' && (
          <div className="text-center py-8">
            <p className="text-lg font-bold text-white/60">Time's Up</p>
            <p className="text-sm text-white/30 mt-1">This puzzle has expired. Come back tomorrow.</p>
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
    default: return <GenericPuzzle data={data} onAnswer={onAnswer} />;
  }
}

function AlibiPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  const suspects = data.suspects as Array<{ name: string; claim: string }>;
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-base md:text-sm text-white/60 text-center">Who's lying? Tap the suspect with the contradicting alibi.</p>
      <div className="space-y-2">
        {suspects?.map(s => (
          <button
            key={s.name}
            onClick={() => { setSelected(s.name); onAnswer(s.name); }}
            className={`w-full text-left p-4 md:p-3 rounded-lg transition-all min-h-[44px] ${
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
            className={`px-4 py-3 md:py-2 rounded-lg text-base md:text-sm font-medium transition-all min-h-[44px] ${
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
            className={`w-full text-left p-4 md:p-3 rounded-lg transition-all min-h-[44px] ${
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

function GenericPuzzle({ data, onAnswer }: { data: Record<string, unknown>; onAnswer: (a: unknown) => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-white/40">Puzzle mode not yet implemented.</p>
      <p className="text-xs text-white/20 mt-1">Check back soon.</p>
    </div>
  );
}
