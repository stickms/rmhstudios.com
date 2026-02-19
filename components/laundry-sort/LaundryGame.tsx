'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { LaundryUI } from './LaundryUI';

interface Clothing {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  colorName: string;
  type: 'shirt' | 'pants';
  rotation: number;
  angularVelocity: number;
  isDragging: boolean;
}

interface Bin {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  colorName: string;
}

interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  yellow: '#eab308',
  green: '#22c55e',
};

const COLOR_NAMES = ['red', 'blue', 'yellow', 'green'];

const GRAVITY = 0.05;
const FRICTION = 0.98;
const BOUNCE = 0.3;

const BINS: Bin[] = [
  { x: 75, y: 440, width: 150, height: 80, color: COLORS.red, colorName: 'red' },
  { x: 225, y: 440, width: 150, height: 80, color: COLORS.blue, colorName: 'blue' },
  { x: 375, y: 440, width: 150, height: 80, color: COLORS.yellow, colorName: 'yellow' },
  { x: 525, y: 440, width: 150, height: 80, color: COLORS.green, colorName: 'green' },
];

const WALLS: Wall[] = [
  { x: 150, y: 440, width: 6, height: 80 },
  { x: 300, y: 440, width: 6, height: 80 },
  { x: 450, y: 440, width: 6, height: 80 },
];

export function LaundryGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(60);
  const [gameActive, setGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const gameStateRef = useRef({
    clothing: [] as Clothing[],
    clothingId: 0,
    draggedClothing: [] as Clothing[],
    dragOffsetX: 0,
    dragOffsetY: 0,
    gameStartTime: 0,
    isPointerDown: false,
  });

  // Spawn clothing with increasing rate
  useEffect(() => {
    if (!gameActive || gameOver) return;

    if (gameStateRef.current.gameStartTime === 0) {
      gameStateRef.current.gameStartTime = Date.now();
    }

    let lastSpawnTime = 0;
    const minSpawnInterval = 500; // Minimum interval (max spawn rate)
    const maxSpawnInterval = 2000; // Initial interval

    const spawn = () => {
      const now = Date.now();
      
      // Calculate current spawn interval based on elapsed time
      const elapsedMs = now - gameStateRef.current.gameStartTime;
      const elapsedSeconds = Math.min(elapsedMs / 1000, 60);
      const progressRatio = elapsedSeconds / 60; // 0 to 1 as time progresses
      const currentInterval = maxSpawnInterval - (progressRatio * (maxSpawnInterval - minSpawnInterval));
      
      if (now - lastSpawnTime > currentInterval) {
        lastSpawnTime = now;

        const spawnCount = 1 + Math.floor(progressRatio * 2); // 1 to 3
        for (let i = 0; i < spawnCount; i++) {
          const randomColor = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
          const isShirt = Math.random() > 0.4;
          const width = isShirt ? 40 : 35;
          const height = isShirt ? 50 : 70;

          const newClothing: Clothing = {
            id: gameStateRef.current.clothingId++,
            x: Math.random() * (600 - width) + width / 2,
            y: -30,
            vx: (Math.random() - 0.5) * 2,
            vy: 0,
            width,
            height,
            color: COLORS[randomColor as keyof typeof COLORS],
            colorName: randomColor,
            type: isShirt ? 'shirt' : 'pants',
            rotation: Math.random() * Math.PI * 2,
            angularVelocity: (Math.random() - 0.5) * 0.1,
            isDragging: false,
          };

          gameStateRef.current.clothing.push(newClothing);

          // Remove after 15 seconds
          setTimeout(() => {
            gameStateRef.current.clothing = gameStateRef.current.clothing.filter(
              c => c.id !== newClothing.id
            );
          }, 15000);
        }
      }
      
      requestAnimationFrame(spawn);
    };

    const spawnAnimFrameId = requestAnimationFrame(spawn);

    return () => cancelAnimationFrame(spawnAnimFrameId);
  }, [gameActive, gameOver]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      // Clear canvas
      ctx.fillStyle = '#0f0f1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (gameActive && !gameOver) {
        const state = gameStateRef.current;

        // Update clothing physics
        state.clothing.forEach(clothing => {
          if (!clothing.isDragging) {
            clothing.vy += GRAVITY;
            clothing.vy *= FRICTION;
            clothing.vx *= FRICTION;

            clothing.x += clothing.vx;
            clothing.y += clothing.vy;
            clothing.rotation += clothing.angularVelocity;
          }

          // Boundary collisions
          if (clothing.x - clothing.width / 2 < 0) {
            clothing.x = clothing.width / 2;
            clothing.vx = Math.abs(clothing.vx) * BOUNCE;
          }
          if (clothing.x + clothing.width / 2 > canvas.width) {
            clothing.x = canvas.width - clothing.width / 2;
            clothing.vx = -Math.abs(clothing.vx) * BOUNCE;
          }

          // Bottom boundary (but don't remove yet, check for bin)
          if (clothing.y + clothing.height / 2 > canvas.height) {
            clothing.y = canvas.height - clothing.height / 2;
            clothing.vy = -Math.abs(clothing.vy) * BOUNCE;
          }

          // Wall collisions between bins
          WALLS.forEach(wall => {
            const overlapX =
              clothing.x + clothing.width / 2 > wall.x - wall.width / 2 &&
              clothing.x - clothing.width / 2 < wall.x + wall.width / 2;
            const overlapY =
              clothing.y + clothing.height / 2 > wall.y - wall.height / 2 &&
              clothing.y - clothing.height / 2 < wall.y + wall.height / 2;

            if (overlapX && overlapY) {
              if (clothing.x < wall.x) {
                clothing.x = wall.x - wall.width / 2 - clothing.width / 2;
                clothing.vx = -Math.abs(clothing.vx) * BOUNCE;
              } else {
                clothing.x = wall.x + wall.width / 2 + clothing.width / 2;
                clothing.vx = Math.abs(clothing.vx) * BOUNCE;
              }
            }
          });

          // Check bin collisions
          BINS.forEach(bin => {
            if (
              clothing.x > bin.x - bin.width / 2 &&
              clothing.x < bin.x + bin.width / 2 &&
              clothing.y > bin.y - bin.height / 2 &&
              clothing.y < bin.y + bin.height / 2
            ) {
              const correct = clothing.colorName === bin.colorName;
              setScore(s => correct ? s + 100 : Math.max(0, s - 50));
              state.clothing = state.clothing.filter(c => c.id !== clothing.id);
            }
          });
        });
      }

      // Draw bins
      BINS.forEach(bin => {
        ctx.fillStyle = bin.color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(
          bin.x - bin.width / 2,
          bin.y - bin.height / 2,
          bin.width,
          bin.height
        );
        ctx.globalAlpha = 1;

        // Bin border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          bin.x - bin.width / 2,
          bin.y - bin.height / 2,
          bin.width,
          bin.height
        );

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bin.colorName.toUpperCase(), bin.x, bin.y);
      });

      // Draw divider walls
      WALLS.forEach(wall => {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(
          wall.x - wall.width / 2,
          wall.y - wall.height / 2,
          wall.width,
          wall.height
        );
      });

      // Draw clothing
      gameStateRef.current.clothing.forEach(clothing => {
        ctx.save();
        ctx.translate(clothing.x, clothing.y);
        ctx.rotate(clothing.rotation);

        if (clothing.type === 'shirt') {
          // Draw shirt with collar and sleeves
          ctx.fillStyle = clothing.color;
          
          // Main body
          ctx.fillRect(-clothing.width / 2, -clothing.height / 2, clothing.width, clothing.height);
          
          // Left sleeve
          ctx.fillRect(-clothing.width / 2 - 8, -clothing.height / 4, 8, clothing.height / 2);
          
          // Right sleeve
          ctx.fillRect(clothing.width / 2, -clothing.height / 4, 8, clothing.height / 2);
          
          // Collar triangle at top
          ctx.beginPath();
          ctx.moveTo(-clothing.width / 4, -clothing.height / 2);
          ctx.lineTo(clothing.width / 4, -clothing.height / 2);
          ctx.lineTo(0, -clothing.height / 2 + 8);
          ctx.fill();
          
          // Button line down the middle
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -clothing.height / 2 + 5);
          ctx.lineTo(0, clothing.height / 2 - 5);
          ctx.stroke();
          
          // Buttons
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          for (let i = -2; i <= 2; i++) {
            ctx.fillRect(-2, i * 10, 4, 3);
          }
        } else {
          // Draw pants
          ctx.fillStyle = clothing.color;
          
          // Left leg
          ctx.fillRect(-clothing.width / 2, -clothing.height / 2, clothing.width / 2 - 2, clothing.height);
          
          // Right leg
          ctx.fillRect(2, -clothing.height / 2, clothing.width / 2 - 2, clothing.height);
          
          // Waistband at top
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(-clothing.width / 2, -clothing.height / 2, clothing.width, 4);
          
          // Seam down the middle
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -clothing.height / 2);
          ctx.lineTo(0, clothing.height / 2);
          ctx.stroke();
        }

        // Border for visibility
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          -clothing.width / 2,
          -clothing.height / 2,
          clothing.width,
          clothing.height
        );

        ctx.restore();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, [gameActive, gameOver]);

  // Timer
  useEffect(() => {
    if (!gameActive || gameOver) return;

    const interval = setInterval(() => {
      setTime(t => {
        if (t <= 1) {
          setGameActive(false);
          setGameOver(true);
          gameStateRef.current.clothing = [];
          gameStateRef.current.draggedClothing = [];
          gameStateRef.current.isPointerDown = false;
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameActive, gameOver]);

  // Mouse/touch handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    gameStateRef.current.isPointerDown = true;

    // Find all clothing under cursor
    gameStateRef.current.draggedClothing = [];
    for (let i = gameStateRef.current.clothing.length - 1; i >= 0; i--) {
      const c = gameStateRef.current.clothing[i];
      if (
        x > c.x - c.width / 2 &&
        x < c.x + c.width / 2 &&
        y > c.y - c.height / 2 &&
        y < c.y + c.height / 2
      ) {
        c.isDragging = true;
        gameStateRef.current.draggedClothing.push(c);
      }
    }
    gameStateRef.current.dragOffsetX = x;
    gameStateRef.current.dragOffsetY = y;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !gameStateRef.current.isPointerDown) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if new items are under the cursor and add them
    for (let i = gameStateRef.current.clothing.length - 1; i >= 0; i--) {
      const c = gameStateRef.current.clothing[i];
      if (!c.isDragging &&
        x > c.x - c.width / 2 &&
        x < c.x + c.width / 2 &&
        y > c.y - c.height / 2 &&
        y < c.y + c.height / 2
      ) {
        c.isDragging = true;
        gameStateRef.current.draggedClothing.push(c);
      }
    }

    if (gameStateRef.current.draggedClothing.length > 0) {
      // Move all dragged items
      const deltaX = x - gameStateRef.current.dragOffsetX;
      const deltaY = y - gameStateRef.current.dragOffsetY;

      gameStateRef.current.draggedClothing.forEach(c => {
        c.x += deltaX;
        c.y += deltaY;
        c.vx = deltaX * 0.1;
        c.vy = deltaY * 0.1;
      });
    }

    gameStateRef.current.dragOffsetX = x;
    gameStateRef.current.dragOffsetY = y;
  }, []);

  const handleMouseUp = useCallback(() => {
    gameStateRef.current.isPointerDown = false;
    gameStateRef.current.draggedClothing.forEach(c => {
      c.isDragging = false;
    });
    gameStateRef.current.draggedClothing = [];
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    gameStateRef.current.isPointerDown = true;

    // Find all clothing under touch point
    gameStateRef.current.draggedClothing = [];
    for (let i = gameStateRef.current.clothing.length - 1; i >= 0; i--) {
      const c = gameStateRef.current.clothing[i];
      if (
        x > c.x - c.width / 2 &&
        x < c.x + c.width / 2 &&
        y > c.y - c.height / 2 &&
        y < c.y + c.height / 2
      ) {
        c.isDragging = true;
        gameStateRef.current.draggedClothing.push(c);
      }
    }
    gameStateRef.current.dragOffsetX = x;
    gameStateRef.current.dragOffsetY = y;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !gameStateRef.current.isPointerDown || !e.touches.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    // Check if new items are under the touch point and add them
    for (let i = gameStateRef.current.clothing.length - 1; i >= 0; i--) {
      const c = gameStateRef.current.clothing[i];
      if (!c.isDragging &&
        x > c.x - c.width / 2 &&
        x < c.x + c.width / 2 &&
        y > c.y - c.height / 2 &&
        y < c.y + c.height / 2
      ) {
        c.isDragging = true;
        gameStateRef.current.draggedClothing.push(c);
      }
    }

    if (gameStateRef.current.draggedClothing.length > 0) {
      // Move all dragged items
      const deltaX = x - gameStateRef.current.dragOffsetX;
      const deltaY = y - gameStateRef.current.dragOffsetY;

      gameStateRef.current.draggedClothing.forEach(c => {
        c.x += deltaX;
        c.y += deltaY;
      });
    }

    gameStateRef.current.dragOffsetX = x;
    gameStateRef.current.dragOffsetY = y;
  }, []);

  const handleTouchEnd = useCallback(() => {
    gameStateRef.current.isPointerDown = false;
    gameStateRef.current.draggedClothing.forEach(c => {
      c.isDragging = false;
    });
    gameStateRef.current.draggedClothing = [];
  }, []);

  return (
    <div className="w-full h-full relative bg-black flex flex-col items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        width={600}
        height={480}
        className="border-2 border-cyan-500 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      <LaundryUI 
        score={score} 
        time={time} 
        gameActive={gameActive} 
        gameOver={gameOver} 
        onStart={() => {
          setGameActive(true);
          setGameOver(false);
          setScore(0);
          setTime(60);
        }} 
      />
    </div>
  );
}
