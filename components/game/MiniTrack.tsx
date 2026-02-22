'use client';

import { Opponent } from '@/lib/game/useOpponents';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface MiniTrackProps {
  opponent: Opponent;
}

export function MiniTrack({ opponent }: MiniTrackProps) {
  return (
    <Card className="p-2 bg-zinc-900 border-zinc-800 flex flex-col gap-1 w-full relative overflow-hidden">
        {/* Background flash on combo? */}
        <div className="flex justify-between items-center text-xs text-zinc-300">
            <span className="font-bold truncate max-w-[80px]" style={{ color: opponent.avatarColor }}>
                {opponent.name}
            </span>
            <span>{opponent.score.toLocaleString()}</span>
        </div>
        
        <Progress value={opponent.progress} className="h-1.5 bg-zinc-800" indicatorClassName="bg-linear-to-r from-blue-500 to-cyan-400" />
        
        <div className="absolute top-1 right-1 opacity-20 text-4xl font-black text-white pointer-events-none select-none">
            {opponent.combo > 5 ? opponent.combo : ''}
        </div>
    </Card>
  );
}
