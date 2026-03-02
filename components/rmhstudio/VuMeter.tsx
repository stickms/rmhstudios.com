/**
 * VuMeter — Vertical peak level meter.
 */
'use client';

import { useEffect, useRef } from 'react';

interface VuMeterProps {
  /** Returns current peak amplitude 0–1 */
  getPeak: () => number;
  height?: number;
  width?: number;
}

export default function VuMeter({ getPeak, height = 140, width = 8 }: VuMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const raw = getPeak();
      // Smooth falloff
      smoothedRef.current = Math.max(raw, smoothedRef.current * 0.92);
      const level = smoothedRef.current;

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = 'var(--rstudio-bg)';
      ctx.fillRect(0, 0, width, height);

      // Meter fill (bottom to top)
      const fillHeight = level * height;
      if (fillHeight > 0) {
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#5cc98a');    // green
        gradient.addColorStop(0.6, '#5cc98a');
        gradient.addColorStop(0.8, '#d9b84e');  // yellow
        gradient.addColorStop(1, '#e06070');     // red
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height - fillHeight, width, fillHeight);
      }

      // Segment lines
      ctx.fillStyle = 'var(--rstudio-bg)';
      const segCount = 20;
      const segH = height / segCount;
      for (let i = 1; i < segCount; i++) {
        ctx.fillRect(0, i * segH - 0.5, width, 1);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [getPeak, height, width]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        borderRadius: 2,
        border: '1px solid var(--rstudio-border)',
      }}
    />
  );
}
