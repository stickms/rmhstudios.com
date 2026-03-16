import { useRef, useEffect } from 'react';

interface SpectrumAnalyzerProps {
  analyserData?: Float32Array;
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Canvas-rendered FFT spectrum display.
 */
export function SpectrumAnalyzer({
  analyserData,
  width = 200,
  height = 60,
  color = '#22d3ee',
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, width, height);

    if (!analyserData || analyserData.length === 0) return;

    const barCount = Math.min(64, analyserData.length);
    const barWidth = width / barCount;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color);

    ctx.fillStyle = gradient;

    for (let i = 0; i < barCount; i++) {
      // Map from dB (-100 to 0) to 0-1
      const db = analyserData[i];
      const normalized = Math.max(0, (db + 100) / 100);
      const barHeight = normalized * height;

      ctx.fillRect(
        i * barWidth + 0.5,
        height - barHeight,
        barWidth - 1,
        barHeight,
      );
    }
  }, [analyserData, width, height, color]);

  return <canvas ref={canvasRef} className="rounded-sm" />;
}
