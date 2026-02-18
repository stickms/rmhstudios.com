import { GameCanvas } from '@/components/game/GameCanvas';
import { OpponentGrid } from '@/components/game/OpponentGrid';

export default function SliceItPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground overflow-hidden">
      <h1 className="text-4xl font-black mb-8 rainbow-text tracking-tighter italic glitch-text">
        SLICE IT!
      </h1>
      
      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-[1600px] items-start px-8">
          <div className="flex-1 w-full relative">
             <div className="neon-border rounded-xl bg-black/50 p-4 border border-neon-purple shadow-lg backdrop-blur-sm">
                <GameCanvas />
             </div>
            
            <div className="mt-8 text-muted-foreground text-sm text-center font-mono">
                <p>Instructions: Click or Tap in time with the beat.</p>
                <p>Blue Dot = You. White Bars = Beats. Magenta Bars = Speed Up.</p>
            </div>
          </div>
          
          <div className="w-full lg:w-72 hidden md:block">
              <h3 className="text-xs font-bold text-neon-cyan mb-2 uppercase tracking-widest neon-glow">Opponents</h3>
              <OpponentGrid />
          </div>
      </div>
    </main>
  );
}
