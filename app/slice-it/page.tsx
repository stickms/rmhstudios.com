import { GameCanvas } from '@/components/game/GameCanvas';
import { LeaderboardSidebar } from '@/components/game/LeaderboardSidebar';

export default function SliceItPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground overflow-hidden">
      <h1 className="text-4xl font-black mb-8 rainbow-text tracking-tighter italic glitch-text">
        SLICE IT!
      </h1>
      
      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-[1600px] items-start px-8 h-[80vh]">
          <div className="flex-1 w-full h-full relative flex flex-col">
             <div className="neon-border rounded-xl bg-black/50 p-4 border border-neon-purple shadow-lg backdrop-blur-sm flex-1 relative min-h-0">
                <GameCanvas />
             </div>
            
            <div className="mt-4 text-muted-foreground text-sm text-center font-mono">
                <p>Instructions: Click or Tap in time with the beat.</p>
                <p>Blue Dot = You. White Bars = Beats. Magenta Bars = Speed Up.</p>
            </div>
          </div>
          
          <div className="w-full lg:w-80 hidden md:block h-full">
              <div className="neon-border rounded-xl bg-black/50 p-4 border border-zinc-800 shadow-lg backdrop-blur-sm h-full overflow-hidden">
                <LeaderboardSidebar />
              </div>
          </div>
      </div>
    </main>
  );
}
