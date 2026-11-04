import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChamberLean } from '@/lib/elections/liquid';

const BLUE_TOP = '#6f90ff';
const BLUE_BOT = '#1a2fb5';
const RED_TOP = '#ff7466';
const RED_BOT = '#b3141a';

interface Bubble {
  x: number;
  y: number;
  r: number;
  v: number;
  ph: number;
}

/**
 * A glass globe half-full of two liquids, blue (Democratic) and red (Republican). The boundary between them sits
 * where the expected seat share says, glides there on a spring, and sloshes when the count moves it. Bubbles
 * rise through each liquid; a dashed line marks the majority. It is drawn on a canvas by one animation loop that
 * ENDS: it runs for a few seconds when the globe scrolls into view, when the lean changes, or when the pointer
 * touches it, then settles and stops (no loop at rest). It also stops while off screen or the tab is hidden,
 * and renders one still frame when the viewer has set jelly motion to Still.
 */
const ACTIVE_MS = 7000;

function Globe({ share, majority, size }: { share: number; majority: number; size: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const target = useRef(share);
  const maj = useRef(majority);
  const kickRef = useRef<(ms?: number) => void>(() => {});
  target.current = share;
  maj.current = majority;
  // A new lean wakes the loop so the liquid visibly moves to it.
  useEffect(() => {
    kickRef.current();
  }, [share, majority]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const R = size / 2 - 8;
    const cx = size / 2;
    const cy = size / 2;
    let cur = target.current;
    let vel = 0;
    let amp = 6;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let visible = false;
    let activeUntil = 0;
    let pointer = { x: 0, y: 0 };
    const isStill = () => document.documentElement.getAttribute('data-jelly-motion') === 'still';
    const kick = (ms = ACTIVE_MS) => {
      activeUntil = Math.max(activeUntil, performance.now() + ms);
      if (visible && !raf && document.visibilityState === 'visible') {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    kickRef.current = kick;
    const bubbles: Bubble[] = Array.from({ length: 22 }, (_, i) => ({
      x: cx - R + ((i * 97) % 1000) / 1000 * 2 * R,
      y: cy + R - ((i * 53) % 1000) / 1000 * 2 * R,
      r: 2 + ((i * 31) % 5),
      v: 10 + ((i * 17) % 18),
      ph: i * 1.7,
    }));

    // The highlight follows the pointer only while the pointer is over the globe (which also wakes the loop).
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
      kick(2500);
    };
    canvas.addEventListener('pointermove', onMove, { passive: true });
    const onTouch = () => kick(4000);
    canvas.addEventListener('pointerdown', onTouch, { passive: true });

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === 'visible') kick();
    };
    document.addEventListener('visibilitychange', onVis);

    const boundary = (y: number, bx: number) =>
      bx + amp * Math.sin(y * 0.045 + t * 2.2) + amp * 0.45 * Math.sin(y * 0.09 - t * 3.1) + 2.2 * Math.sin(y * 0.2 + t * 4.3);

    function frame(now: number) {
      raf = 0;
      if (!visible || document.visibilityState !== 'visible') return;
      // (the loop is rescheduled at the end of the frame only while it is still needed — see below)
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const still = isStill();
      if (still) {
        // Still motion: jump to the value and draw one calm frame.
        cur = target.current;
        vel = 0;
        amp = 3;
      } else {
        t += dt;
      }

      // spring toward the target share; the speed it moves at stirs the slosh
      if (!still) {
        const k = 38;
        const c = 6.5;
        vel += (k * (target.current - cur) - c * vel) * dt;
        cur += vel * dt;
        const calm = activeUntil - now < 1500 ? 1.2 : 4; // the slosh eases off before the loop ends
        amp += (calm + Math.min(26, Math.abs(vel) * 260) - amp) * Math.min(1, dt * 2.2);
      }

      ctx!.clearRect(0, 0, size, size);
      const L = cx - R;
      const T = cy - R;
      const B = cy + R;
      const bx = L + Math.min(1, Math.max(0, cur)) * 2 * R;

      // glass back
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.clip();
      const back = ctx!.createLinearGradient(0, T, 0, B);
      back.addColorStop(0, '#f4f3f7');
      back.addColorStop(1, '#dedde6');
      ctx!.fillStyle = back;
      ctx!.fillRect(L, T, 2 * R, 2 * R);

      // liquids
      const steps = 64;
      const left = ctx!.createLinearGradient(0, T, 0, B);
      left.addColorStop(0, BLUE_TOP);
      left.addColorStop(1, BLUE_BOT);
      ctx!.fillStyle = left;
      ctx!.beginPath();
      ctx!.moveTo(L - 12, T - 12);
      for (let i = 0; i <= steps; i++) {
        const y = T - 12 + ((B - T + 24) * i) / steps;
        ctx!.lineTo(boundary(y, bx), y);
      }
      ctx!.lineTo(L - 12, B + 12);
      ctx!.closePath();
      ctx!.fill();
      const right = ctx!.createLinearGradient(0, T, 0, B);
      right.addColorStop(0, RED_TOP);
      right.addColorStop(1, RED_BOT);
      ctx!.fillStyle = right;
      ctx!.beginPath();
      ctx!.moveTo(L + 2 * R + 12, T - 12);
      for (let i = 0; i <= steps; i++) {
        const y = T - 12 + ((B - T + 24) * i) / steps;
        ctx!.lineTo(boundary(y, bx), y);
      }
      ctx!.lineTo(L + 2 * R + 12, B + 12);
      ctx!.closePath();
      ctx!.fill();

      // meniscus where the two meet
      ctx!.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx!.lineWidth = 2.5;
      ctx!.beginPath();
      for (let i = 0; i <= steps; i++) {
        const y = T + ((B - T) * i) / steps;
        if (i === 0) ctx!.moveTo(boundary(y, bx), y);
        else ctx!.lineTo(boundary(y, bx), y);
      }
      ctx!.stroke();

      // bubbles rise through whichever liquid they are in
      for (const b of bubbles) {
        b.y -= b.v * dt;
        if (b.y < T - 6) {
          b.y = B + 6;
          b.x = L + ((Math.sin(b.ph + t) + 1) / 2) * 2 * R;
        }
        const x = b.x + Math.sin(t * 1.4 + b.ph) * 5;
        ctx!.fillStyle = 'rgba(255,255,255,0.28)';
        ctx!.beginPath();
        ctx!.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = 'rgba(255,255,255,0.55)';
        ctx!.beginPath();
        ctx!.arc(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
        ctx!.fill();
      }

      // majority line
      const mx = L + maj.current * 2 * R;
      ctx!.setLineDash([7, 6]);
      ctx!.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(mx, T);
      ctx!.lineTo(mx, B);
      ctx!.stroke();
      ctx!.setLineDash([]);

      // depth: dark toward the rim
      const depth = ctx!.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
      depth.addColorStop(0, 'rgba(0,0,0,0)');
      depth.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx!.fillStyle = depth;
      ctx!.fillRect(L, T, 2 * R, 2 * R);

      // light, following the pointer a little
      const hx = cx - R * 0.38 + pointer.x * 14;
      const hy = cy - R * 0.42 + pointer.y * 14;
      const glow = ctx!.createRadialGradient(hx, hy, 2, hx, hy, R * 0.6);
      glow.addColorStop(0, 'rgba(255,255,255,0.7)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx!.fillStyle = glow;
      ctx!.fillRect(L, T, 2 * R, 2 * R);
      ctx!.restore();

      // specular arc and rim
      ctx!.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx!.lineWidth = 5;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.34);
      ctx!.stroke();
      ctx!.strokeStyle = '#0b0b0c';
      ctx!.lineWidth = 4;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.stroke();

      // Settled and past its active window: stop. Anything that moves or scrolls it back in view starts it again.
      const settled = Math.abs(target.current - cur) < 0.0005 && Math.abs(vel) < 0.002;
      if (still || (now > activeUntil && settled)) return;
      raf = requestAnimationFrame(frame);
    }
    // First paint (visible is set by the observer, which fires on observe).
    visible = true;
    kick();

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      kickRef.current = () => {};
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onTouch);
    };
  }, [size]);

  return <canvas ref={ref} className="el-globe__canvas" style={{ width: size, height: size }} aria-hidden />;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** The liquid globe: where each chamber is leaning right now, as two liquids in a glass sphere. */
export function LiquidGlobe({ leans }: { leans: Partial<Record<'senate' | 'house', ChamberLean | null>> }) {
  const { t } = useTranslation('c-elections');
  const available = (['senate', 'house'] as const).filter((o) => leans[o]);
  const [pick, setPick] = useState<'senate' | 'house'>('senate');
  const office = available.includes(pick) ? pick : available[0];
  const lean = office ? leans[office] : null;
  const [size, setSize] = useState(380);
  useEffect(() => {
    const fit = () => setSize(Math.max(240, Math.min(420, window.innerWidth - 72)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const word =
    !lean
      ? ''
      : lean.basis === 'final'
        ? lean.dem > lean.gop
          ? t('globe.finalDem', { defaultValue: 'Democrats win it' })
          : t('globe.finalGop', { defaultValue: 'Republicans win it' })
        : lean.lean === 'even'
          ? t('globe.even', { defaultValue: 'Too close to call' })
          : lean.lean === 'dem'
            ? t('globe.leanDem', { defaultValue: 'Leans Democratic' })
            : t('globe.leanGop', { defaultValue: 'Leans Republican' });

  return (
    <section className="el-wrap el-globe" aria-label={t('globe.title', { defaultValue: 'Control of Congress' })}>
      <div className="el-globe__frame el-box">
        <div className="el-globe__stage">
          {lean ? (
            <Globe share={lean.demShare} majority={lean.majorityShare} size={size} />
          ) : (
            <div className="el-globe__empty" style={{ width: size, height: size }} />
          )}
        </div>

        <div className="el-globe__panel">
          <p className="el-eyebrow" style={{ margin: 0 }}>
            {t('globe.eyebrow', { defaultValue: 'Which way is it leaning?' })}
          </p>
          <div className="el-pick-row" role="group" aria-label={t('globe.chamber', { defaultValue: 'Chamber' })}>
            {(['senate', 'house'] as const).map((o) => (
              <button key={o} type="button" className="el-btn el-btn--sm" aria-pressed={office === o} disabled={!leans[o]} onClick={() => setPick(o)}>
                {o === 'senate' ? t('globe.senate', { defaultValue: 'Senate' }) : t('globe.house', { defaultValue: 'House' })}
              </button>
            ))}
          </div>

          {lean ? (
            <>
              <h2 className="el-globe__word">{word}</h2>
              <div className="el-globe__nums">
                <span className="el-globe__d">
                  <strong>{num(lean.dem)}</strong> {t('globe.dem', { defaultValue: 'Democratic seats' })}
                </span>
                <span className="el-globe__r">
                  <strong>{num(lean.gop)}</strong> {t('globe.gop', { defaultValue: 'Republican seats' })}
                </span>
              </div>
              <p className="el-globe__odds">
                {t('globe.control', { defaultValue: 'Chance of control: Democrats {{d}} · Republicans {{r}}', d: pct(lean.demControl), r: pct(lean.gopControl) })}
                {1 - lean.demControl - lean.gopControl > 0.03
                  ? t('globe.tie', { defaultValue: ' · neither (a tie) {{n}}', n: pct(1 - lean.demControl - lean.gopControl) })
                  : ''}
              </p>
              <p className="el-eyebrow" style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
                {lean.basis === 'final'
                  ? t('globe.noteFinal', { defaultValue: 'Every race is decided. Dashed line: {{n}} seats for a majority.', n: lean.toWin })
                  : t('globe.note', {
                      defaultValue:
                        'An indicative model from ratings and the count so far, not a forecast. {{n}} races still open. Dashed line: {{w}} seats for a majority.',
                      n: lean.undecided,
                      w: lean.toWin,
                    })}
              </p>
            </>
          ) : (
            <p className="el-globe__word">{t('globe.waiting', { defaultValue: 'The globe fills in once the chamber tallies are published.' })}</p>
          )}
        </div>
      </div>
    </section>
  );
}
