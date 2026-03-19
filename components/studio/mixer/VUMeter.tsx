import { useRef, useEffect } from 'react';

interface VUMeterProps {
  level: number; // 0–1 normalized
  peak?: number;
  width?: number;
  height?: number;
  horizontal?: boolean;
}

/**
 * Canvas-rendered VU meter at 30fps.
 */
export function VUMeter({ level, peak = 0, width = 8, height = 120, horizontal = false }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animLevel = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = horizontal ? height : width;
      const h = horizontal ? width : height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);

      // Smooth falloff
      animLevel.current += (level - animLevel.current) * 0.3;
      const l = Math.max(0, Math.min(1, animLevel.current));

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);

      // Meter segments
      const totalSegments = 24;
      const segGap = 1;

      for (let i = 0; i < totalSegments; i++) {
        const frac = i / totalSegments;
        const segOn = frac < l;

        if (!segOn) continue;

        // Color gradient: green → yellow → red
        let color: string;
        if (frac < 0.6) color = '#22c55e';
        else if (frac < 0.8) color = '#eab308';
        else color = '#ef4444';

        ctx.fillStyle = color;
        if (horizontal) {
          const sx = (i / totalSegments) * w;
          const sw = w / totalSegments - segGap;
          ctx.fillRect(sx, 1, sw, h - 2);
        } else {
          const segH = h / totalSegments - segGap;
          const sy = h - ((i + 1) / totalSegments) * h;
          ctx.fillRect(1, sy, w - 2, segH);
        }
      }

      // Peak indicator
      if (peak > 0) {
        const peakPos = peak * (horizontal ? w : h);
        ctx.fillStyle = peak > 0.9 ? '#ef4444' : '#fff';
        if (horizontal) {
          ctx.fillRect(peakPos - 1, 0, 2, h);
        } else {
          ctx.fillRect(0, h - peakPos - 1, w, 2);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, peak, width, height, horizontal]);

  return <canvas ref={canvasRef} className="shrink-0 rounded-sm" />;
}
