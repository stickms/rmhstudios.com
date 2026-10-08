import { useRef, useEffect } from 'react';

interface VUMeterProps {
  level: number; // 0–1 normalized
  peak?: number;
  width?: number;
  height?: number;
  horizontal?: boolean;
}

/**
 * Canvas-rendered VU meter.
 *
 * Idle at rest: the frame loop runs only while the displayed level is still
 * easing toward `level`, then stops. It used to reschedule itself forever and
 * repaint an unchanged meter on every vsync — two master meters plus one per
 * channel strip, so a mixer at rest cost (2 + channels) canvas repaints per
 * frame, 2.4× as many on a 144Hz panel as on a 60Hz one. A prop change re-runs
 * the effect, which is what wakes it.
 *
 * The easing is time-based (a half-life, not a per-frame factor) so the needle
 * falls at the same speed at 60, 144 or 240Hz.
 */
export function VUMeter({ level, peak = 0, width = 8, height = 120, horizontal = false }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animLevel = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = horizontal ? height : width;
      const h = horizontal ? width : height;

      // Only when it actually changed. Assigning `canvas.width` reallocates the
      // backing store and resets the context — this loop was doing that on every
      // frame, for every channel strip in the mixer, to arrive at the size it
      // already had. The transform is re-established either way: a resize clears
      // it, so it is set there, and otherwise it is reset explicitly before the
      // scale so repeated frames cannot compound it.
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Smooth falloff — the old per-frame factor of 0.3 at 60Hz, expressed as
      // a frame-rate-independent decay (k = 1 - 0.7^(dt/16.67ms)).
      const dt = last ? Math.min(100, now - last) : 1000 / 60;
      last = now;
      animLevel.current += (level - animLevel.current) * (1 - Math.pow(0.7, dt / (1000 / 60)));
      const settled = Math.abs(level - animLevel.current) < 0.002;
      if (settled) animLevel.current = level;
      const l = Math.max(0, Math.min(1, animLevel.current));

      // Explicit, because the per-frame `canvas.width` write that used to clear
      // this surface as a side effect is gone. The background below is 40%
      // black: composited onto the previous frame instead of onto nothing, it
      // would darken toward opaque over a second or two.
      ctx.clearRect(0, 0, w, h);

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

      if (!settled) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, peak, width, height, horizontal]);

  return <canvas ref={canvasRef} className="shrink-0 rounded-sm" />;
}
