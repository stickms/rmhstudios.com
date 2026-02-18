'use client';

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';

// Render Helper
const getSliceColor = (type: string) => {
    switch (type) {
        case 'SPEED': return '#ff00ff'; // Neon Pink
        case 'MOVING': return '#ffff00'; // Neon Yellow
        case 'LONG': return '#00ff00'; // Neon Green
        case 'SILENT': return '#52525b'; // Zinc-600 (Keep for contrast)
        default: return '#fff'; // White
    }
};

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const rafRef = useRef<number | null>(null);

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
      
      // Render
      render(ctx, newEngine);
      
      rafRef.current = requestAnimationFrame(loop);
    };
    
    rafRef.current = requestAnimationFrame(loop);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      AudioManager.getInstance().stop();
    };
  }, []);

  const handleInput = () => {
    if (engine) {
        const audio = AudioManager.getInstance();
        if (audio.getContext()?.state === 'suspended') {
            audio.getContext()?.resume();
            engine.start();
        } else if (audio.getCurrentTime() === 0) {
            engine.start();
        }

        engine.submitInput();
    }
  };

  const render = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
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
      
      // Draw Track Line (Glow)
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00ffff'; // Neon Cyan
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      const PIXELS_PER_SEC = 200; // Faster scroll
      
      // Draw Slices
      const map = engine.getActiveMap();
      if (map) {
        map.slices.forEach(slice => {
          // Calculate X position relative to current time
          // If we want the cursor to be fixed at X=200, track moves left
          // SliceX = 200 + (sliceTime - currentTime) * Speed
          
          const cursorFixedX = 200;
          const sliceX = cursorFixedX + (slice.time - currentTime) * PIXELS_PER_SEC;
          let sliceY = height / 2;
          
          // Moving Slice Logic: Oscillate Y
          if (slice.type === 'MOVING') {
              // Only oscillate when close? Or always?
              // Let's oscillate based on spatial position to be consistent
              sliceY += Math.sin(slice.time * 10) * 50; 
          }
          
          // Only draw if on screen
          if (sliceX >= -100 && sliceX <= width + 100) {
             ctx.fillStyle = getSliceColor(slice.type);
             ctx.shadowColor = ctx.fillStyle;
             ctx.shadowBlur = 10;
             
             if (slice.type === 'LONG' && slice.duration) {
                 const length = slice.duration * PIXELS_PER_SEC;
                 // Draw tail to right or left? Time forward is right.
                 // Slice starts at sliceX. Ends at sliceX + duration*speed.
                 ctx.fillRect(sliceX, sliceY - 10, length, 20);
             } else {
                 // Center the block on the beat?
                 // sliceX is the beat time. 
                 ctx.fillRect(sliceX - 10, sliceY - 20, 20, 40);
             }
             ctx.shadowBlur = 0;
          }
      });
      }
      
      // Draw Player Cursor (Fixed)
      // Visual pulse on beat?
      const cursorFixedX = 200;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(cursorFixedX, height / 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Hit Marker ?
      // Could store last hit in engine and render a splash
  };

  // Handle input and overlays
  const { status, reset } = useGameStore();
  
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
            onMouseDown={handleInput}
            onMouseUp={() => engine?.submitRelease()}
        />
        
        {status === 'PLAYING' && <HUD />}
        
        {status === 'FINISHED' && <GameOver />}
        
        {status === 'MENU' && (
            <MainMenu engine={engine} />
        )}
    </div>
  );
}
