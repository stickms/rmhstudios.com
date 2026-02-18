'use client';

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';
import { Button } from '@/components/ui/button';

// Render Helper
const getSliceColor = (type: string) => {
    switch (type) {
        case 'SPEED': return '#ff00ff'; // Neon Pink
        case 'MOVING': return '#ffff00'; // Neon Yellow
        case 'LONG': return '#00ff00'; // Neon Green
        case 'SILENT': return '#52525b'; // Zinc-600
        case 'BOMB': return '#ef4444'; // Red-500
        case 'SWITCH': return '#3b82f6'; // Blue-500
        default: return '#fff'; // White
    }
};

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  const { status, reset, keybinds, isPaused, setIsPaused } = useGameStore();

  // Use ref to access latest keybinds in the animation loop
  const keybindsRef = useRef(keybinds);
  useEffect(() => {
    keybindsRef.current = keybinds;
  }, [keybinds]);

  useEffect(() => {
    // Initialize Engine
    const newEngine = new GameEngine();
    setEngine(newEngine);
    
    // Start Game Loop
    const loop = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // Update Game State
      newEngine.update();
      
      // Render using the latest keybinds from ref
      render(ctx, newEngine, keybindsRef.current);
      
      rafRef.current = requestAnimationFrame(loop);
    };
    
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      AudioManager.getInstance().stop();
    };
  }, []);

  const handleInput = (lane: number) => {
    if (engine) {
        const audio = AudioManager.getInstance();
        if (audio.getContext()?.state === 'suspended') {
            audio.getContext()?.resume();
            engine.start();
        } else if (audio.getCurrentTime() === 0) {
            engine.start();
        }

        engine.submitInput(lane);
    }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'Escape') {
              e.preventDefault();
              if (status === 'PLAYING') {
                  const store = useGameStore.getState();
                  if (store.isPaused) {
                      engine?.resume();
                  } else {
                      engine?.pause();
                  }
              }
              return;
          }

          if (useGameStore.getState().isPaused) return;
          if (status !== 'PLAYING') return; // Ignore input if not playing

          if (e.code === keybinds.lane1) {
              handleInput(0); // Top Lane
          }
          if (e.code === keybinds.lane2) {
              handleInput(1); // Bottom Lane
          }
          if (e.code === 'Space') {
             e.preventDefault();
             if (!engine?.getActiveMap()) return; // Prevent space scrolling if used elsewhere
          }
      };

      const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') return;
          if (useGameStore.getState().isPaused) return;
          if (status !== 'PLAYING') return;
          
          let clientY = 0;
          if (e instanceof MouseEvent) {
             clientY = e.clientY;
          } else {
             clientY = e.touches[0].clientY;
          }
          
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          
          const relativeY = clientY - rect.top;
          const lane = relativeY < rect.height / 2 ? 0 : 1;
          
          handleInput(lane);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('mousedown', handleGlobalClick);
      window.addEventListener('touchstart', handleGlobalClick);

      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('mousedown', handleGlobalClick);
          window.removeEventListener('touchstart', handleGlobalClick);
      };
  }, [engine, keybinds, status]); // Added status to dependency

  const render = (ctx: CanvasRenderingContext2D, engine: GameEngine, currentKeybinds: { lane1: string, lane2: string }) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      const currentTime = AudioManager.getInstance().getCurrentTime();
      
      // Clear
      ctx.fillStyle = '#0a0a0a'; // Background
      ctx.fillRect(0, 0, width, height);
      
      // Draw Grid/Background Effect
      ctx.strokeStyle = '#27272a'; // Zinc-800
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i+=50) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
      }
      
      const LANES = [height * 0.3, height * 0.7];
      
      // Draw Lane Lines
      LANES.forEach(y => {
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00ffff'; // Neon Cyan
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.shadowBlur = 0;
      });
      
      const PIXELS_PER_SEC = 200; // Faster scroll
      
      // Draw Slices
      const map = engine.getActiveMap();
      const invisibleModifier = useGameStore.getState().modifiers.invisible;

      if (map) {
        map.slices.forEach(slice => {
          if (slice.hit) return; // Skip if hit

          const cursorFixedX = 200;
          const sliceX = cursorFixedX + (slice.time - currentTime) * PIXELS_PER_SEC;
          
          // Get Y based on lane
          const targetY = LANES[slice.lane];
          let sliceY = targetY;
          
          // Moving Slice Logic
          if (slice.type === 'MOVING') {
              sliceY += Math.sin(slice.time * 10) * 30; 
          }
          
          // Switching Slice Logic: Curving Path
          if (slice.type === 'SWITCH') {
              // Start from opposite lane
              const startY = LANES[slice.lane === 0 ? 1 : 0];
              
              // Transition window: 400px (2 seconds)
              const dist = sliceX - cursorFixedX;
              if (dist > 400) {
                  // If far away, stay on opposite lane
                  sliceY = startY;
              } else if (dist > 0) {
                   // Interpolate
                  const progress = 1 - (dist / 400); // 0 to 1 (0 = far, 1 = hit)
                  // Ease in-out
                  const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                  sliceY = startY + (targetY - startY) * ease;
                  
                  // Draw connecting trail
                  ctx.beginPath();
                  ctx.strokeStyle = '#3b82f6';
                  ctx.globalAlpha = 0.5;
                  ctx.moveTo(sliceX, sliceY + 20); // rough trail center
                  ctx.lineTo(sliceX + 50, startY + 20); // trailing back to start
                  ctx.stroke();
                  ctx.globalAlpha = 1;
              } else {
                  // At hit point or past
                  sliceY = targetY;
              }
          }
          
          // Only draw if on screen
          if (sliceX >= -100 && sliceX <= width + 100) {
             ctx.fillStyle = getSliceColor(slice.type);
             ctx.shadowColor = ctx.fillStyle;
             ctx.shadowBlur = 10;
             
             // Invisible Modifier Logic
             if (invisibleModifier && slice.type !== 'BOMB') { // Bombs remain visible? Or fade too? Let's fade them too for cruelty.
                 const dist = sliceX - cursorFixedX;
                 if (dist < 400 && dist > 0) {
                     ctx.globalAlpha = Math.max(0, (dist - 50) / 350); 
                 } else if (dist <= 0) {
                     ctx.globalAlpha = 0;
                 }
             }

             if (slice.type === 'BOMB') {
                 // Draw Bomb (Circle with X)
                 ctx.beginPath();
                 ctx.arc(sliceX, sliceY, 15, 0, Math.PI*2);
                 ctx.fill();
                 ctx.fillStyle = '#000';
                 ctx.font = 'bold 20px sans-serif';
                 ctx.textAlign = 'center';
                 ctx.fillText('!', sliceX, sliceY + 6);
             } else if (slice.type === 'LONG' && slice.duration) {
                 const length = slice.duration * PIXELS_PER_SEC;
                 ctx.fillRect(sliceX, sliceY - 10, length, 20);
             } else {
                 // Standard/Switch
                 ctx.fillRect(sliceX - 10, sliceY - 20, 20, 40);
             }
             
             ctx.shadowBlur = 0;
             ctx.globalAlpha = 1; // Reset alpha
          }
      });
      }
      
      // Draw Player Cursors (Fixed)
      LANES.forEach(y => {
          const cursorFixedX = 200;
          ctx.fillStyle = '#fff';
          ctx.shadowColor = '#fff';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(cursorFixedX, y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Key hints
          ctx.fillStyle = '#666';
          ctx.font = '20px monospace';
          ctx.shadowBlur = 0;
          
          const keyName = y === LANES[0] ? currentKeybinds.lane1 : currentKeybinds.lane2;
          const cleanName = keyName.replace('Key', '').replace('Arrow', '');
          ctx.fillText(cleanName, cursorFixedX - 6, y + 40);
      });

      // Render Feedback
      const now = performance.now();
      engine.feedbackQueue.forEach(fb => {
          const age = now - fb.time;
          if (age > 1000) return; // Expired
          
          const alpha = 1 - (age / 1000);
          const yOffset = (age / 1000) * 50; // Float up
          
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = fb.color;
          ctx.font = 'bold 30px sans-serif';
          ctx.shadowColor = fb.color;
          ctx.shadowBlur = 10;
          ctx.textAlign = 'center';
          
          const laneY = LANES[fb.lane];
          ctx.fillText(fb.text, 200, laneY - 40 - yOffset);
          
          // Hit Splash Ring
          if (age < 300) {
             ctx.beginPath();
             ctx.strokeStyle = fb.color;
             ctx.lineWidth = 3;
             const radius = 20 + (age / 300) * 30;
             ctx.arc(200, laneY, radius, 0, Math.PI * 2);
             ctx.stroke();
          }

          ctx.restore();
      });
  };
  
  // Reset engine when entering menu from finish
  useEffect(() => {
     if (status === 'MENU' && engine) {
         engine.reset();
     }
  }, [status, engine]);

  return (
    <div className="relative w-full max-w-6xl aspect-[16/9] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl bg-black">
        <canvas 
            ref={canvasRef}
            width={1280} 
            height={720}
            className="w-full h-full cursor-pointer"
            // Mouse handling is now done via global listener for split screen, 
            // but we keep this for basic interaction if needed or remove it.
            // valid handlers are attached in useEffect.
        />
        
        {/* Pause Overlay */}
        {isPaused && status === 'PLAYING' && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
                <div className="flex flex-col gap-4 items-center">
                    <h2 className="text-6xl font-black italic text-white tracking-tighter mb-4 animate-pulse">PAUSED</h2>
                    <Button 
                        size="lg" 
                        className="w-48 text-xl font-bold bg-neon-cyan hover:bg-cyan-400 text-black border-none"
                        onClick={() => engine?.resume()}
                    >
                        RESUME
                    </Button>
                    <Button 
                        size="lg" 
                        variant="outline"
                        className="w-48 text-xl font-bold border-2 border-white text-white hover:bg-white hover:text-black"
                        onClick={() => {
                            engine?.reset();
                            engine?.start(); // Restart map
                            setIsPaused(false);
                        }}
                    >
                        RETRY
                    </Button>
                     <Button 
                        size="lg" 
                        variant="ghost"
                        className="w-48 text-xl font-bold text-zinc-400 hover:text-red-500"
                        onClick={() => {
                            useGameStore.getState().setStatus('MENU');
                            setIsPaused(false);
                            engine?.reset();
                        }}
                    >
                        QUIT
                    </Button>
                </div>
            </div>
        )}
        
        {status === 'PLAYING' && <HUD />}
        
        {(status === 'FINISHED' || status === 'FAILED') && <GameOver />}
        
        {status === 'MENU' && (
            <MainMenu engine={engine} />
        )}
    </div>
  );
}
