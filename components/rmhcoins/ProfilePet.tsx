'use client';

import { useEffect, useRef, useState } from 'react';
import { asset } from '@/lib/storage/asset';

export function ProfilePet() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 20, facingRight: true });
  const targetRef = useRef({ x: 20 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    function pickTarget() {
      if (!mounted) return;
      // Pick a random x% between 5 and 85 (leaving room for the 32px sprite)
      targetRef.current.x = 5 + Math.random() * 80;
      // Wait 2-5s before picking the next target
      setTimeout(pickTarget, 2000 + Math.random() * 3000);
    }

    // Pick initial target after a short delay
    setTimeout(pickTarget, 500 + Math.random() * 1000);

    let lastTime = 0;
    function animate(time: number) {
      if (!mounted) return;
      if (lastTime === 0) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      setPos((prev) => {
        const target = targetRef.current.x;
        const diff = target - prev.x;

        // If close enough, idle in place
        if (Math.abs(diff) < 0.5) {
          return prev;
        }

        // Move at ~15% per second
        const speed = 15;
        const step = Math.sign(diff) * Math.min(speed * dt, Math.abs(diff));
        return {
          x: prev.x + step,
          facingRight: diff > 0,
        };
      });

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[48px] rounded-lg overflow-hidden relative"
      style={{ background: '#2d5a1e' }}
    >
      {/* Grass tiles along the bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-4"
        style={{
          backgroundImage: `url('${asset('/sprites/rmhcoins/grass-tile.png')}')`,
          backgroundRepeat: 'repeat-x',
          backgroundSize: '32px 16px',
          imageRendering: 'pixelated',
        }}
      />
      {/* Animated dog */}
      <div
        className="absolute bottom-2"
        style={{
          left: `${pos.x}%`,
          width: 32,
          height: 32,
          backgroundImage: `url('${asset('/sprites/rmhcoins/dog-walk.png')}')`,
          backgroundSize: '128px 32px',
          imageRendering: 'pixelated',
          animation: 'dog-walk-frames 0.4s steps(4) infinite',
          transform: pos.facingRight ? 'scaleX(1)' : 'scaleX(-1)',
        }}
      />
    </div>
  );
}
