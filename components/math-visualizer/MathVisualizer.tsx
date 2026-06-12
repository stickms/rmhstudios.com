import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FunctionSquare, Pi, Box, Snowflake } from 'lucide-react';

type VisualizerMode = 'function' | 'parametric' | 'surface' | 'fractal';

const modes: { id: VisualizerMode; label: string; icon: typeof FunctionSquare }[] = [
  { id: 'function', label: 'Function Grapher', icon: FunctionSquare },
  { id: 'parametric', label: 'Parametric', icon: Pi },
  { id: 'surface', label: '3D Surface', icon: Box },
  { id: 'fractal', label: 'Fractals', icon: Snowflake },
];

export default function MathVisualizer() {
  const [mode, setMode] = useState<VisualizerMode>('function');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-[var(--site-border)] bg-[var(--site-bg-subtle)]">
        <Link to="/builds">
          <button className="text-[var(--site-text-muted)] hover:text-[var(--site-text)] transition-colors p-1.5 rounded-lg hover:bg-[var(--site-surface)]">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <h1 className="text-sm font-bold text-[var(--site-text)] tracking-tight">Math Visualizer</h1>
        <div className="ml-auto flex gap-1">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === m.id
                  ? 'bg-[var(--site-accent)] text-white shadow-sm'
                  : 'text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]'
              }`}
            >
              <m.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 relative">
        {mode === 'function' && <FunctionGrapher />}
        {mode === 'parametric' && <ParametricCurves />}
        {mode === 'surface' && <SurfacePlot />}
        {mode === 'fractal' && <FractalViewer />}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   2D Function Grapher
   ────────────────────────────────────────────── */

const PRESET_FUNCTIONS: { label: string; fn: (x: number) => number; color: string }[] = [
  { label: 'sin(x)', fn: x => Math.sin(x), color: '#ff6b6b' },
  { label: 'cos(x)', fn: x => Math.cos(x), color: '#4ecdc4' },
  { label: 'tan(x)', fn: x => Math.tan(x), color: '#ffe66d' },
  { label: 'x²', fn: x => x * x, color: '#a29bfe' },
  { label: 'x³', fn: x => x * x * x, color: '#fd79a8' },
  { label: '√x', fn: x => x >= 0 ? Math.sqrt(x) : NaN, color: '#00b894' },
  { label: '1/x', fn: x => x !== 0 ? 1 / x : NaN, color: '#e17055' },
  { label: 'sin(1/x)', fn: x => x !== 0 ? Math.sin(1 / x) : 0, color: '#00cec9' },
  { label: 'e^x', fn: x => Math.exp(x), color: '#6c5ce7' },
  { label: 'ln(x)', fn: x => x > 0 ? Math.log(x) : NaN, color: '#fdcb6e' },
  { label: 'sin(x)·cos(x)', fn: x => Math.sin(x) * Math.cos(x), color: '#e84393' },
  { label: '|x|', fn: x => Math.abs(x), color: '#55efc4' },
];

function FunctionGrapher() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expr, setExpr] = useState('Math.sin(x)');
  const [color, setColor] = useState('#ff6b6b');
  const [zoom, setZoom] = useState(50);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(0);
  const [extraFunctions, setExtraFunctions] = useState<{ label: string; fn: (x: number) => number; color: string }[]>([]);
  const [customError, setCustomError] = useState<string | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Parse and evaluate custom expression
  const evaluateCustom = useCallback((x: number): number => {
    try {
      // Build a safe evaluation context
      const context = {
        Math, x, sin: Math.sin, cos: Math.cos, tan: Math.tan,
        abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, log: Math.log,
        PI: Math.PI, E: Math.E, pow: Math.pow, floor: Math.floor,
        ceil: Math.ceil, round: Math.round, max: Math.max, min: Math.min,
      };
      const fn = new Function(...Object.keys(context), `return (${expr});`);
      const result = fn(...Object.values(context));
      return typeof result === 'number' && isFinite(result) ? result : NaN;
    } catch {
      return NaN;
    }
  }, [expr]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'var(--site-bg, #1a1b1e)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + panX, h / 2 + panY);

    // Grid
    const step = zoom;
    const gridExtent = Math.max(w, h) * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = -gridExtent; x <= gridExtent; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, -gridExtent);
      ctx.lineTo(x, gridExtent);
      ctx.stroke();
    }
    for (let y = -gridExtent; y <= gridExtent; y += step) {
      ctx.beginPath();
      ctx.moveTo(-gridExtent, y);
      ctx.lineTo(gridExtent, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-gridExtent, 0);
    ctx.lineTo(gridExtent, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -gridExtent);
    ctx.lineTo(0, gridExtent);
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px var(--font-jetbrains-mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = -Math.floor(gridExtent / step) * step; x <= gridExtent; x += step) {
      if (Math.abs(x) > 0.1) {
        ctx.fillText(x / step > 0 ? `${(x / step).toFixed(0)}` : '', x, 3);
      }
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = -Math.floor(gridExtent / step) * step; y <= gridExtent; y += step) {
      if (Math.abs(y) > 0.1) {
        ctx.fillText(`${(-y / step).toFixed(0)}`, -3, y);
      }
    }

    // Plot a function
    const plotFn = (fn: (x: number) => number, strokeColor: string, lineWidth = 2.5) => {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      const samples = Math.max(w, 800);
      for (let i = 0; i <= samples; i++) {
        const px = (i / samples) * w - w / 2;
        const worldX = px / zoom;
        const worldY = fn(worldX);
        if (isNaN(worldY) || !isFinite(worldY)) {
          started = false;
          continue;
        }
        const sy = -worldY * zoom;
        if (!started) {
          ctx.moveTo(px, sy);
          started = true;
        } else {
          ctx.lineTo(px, sy);
        }
      }
      ctx.stroke();
    };

    // Plot preset/selected function
    if (selectedPreset !== null && PRESET_FUNCTIONS[selectedPreset]) {
      plotFn(PRESET_FUNCTIONS[selectedPreset].fn, PRESET_FUNCTIONS[selectedPreset].color, 3);
    }

    // Plot extra functions
    for (const ef of extraFunctions) {
      plotFn(ef.fn, ef.color, 2);
    }

    // Plot custom expression
    if (selectedPreset === null) {
      plotFn(evaluateCustom, color, 3);
    }

    // Origin dot
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();

    ctx.restore();
  }, [zoom, panX, panY, selectedPreset, color, evaluateCustom, extraFunctions]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Mouse interactions for pan/zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setPanX(p => p + dx);
    setPanY(p => p + dy);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(5, Math.min(500, z * delta)));
  };

  const handlePresetSelect = (idx: number) => {
    setSelectedPreset(idx);
    setCustomError(null);
  };

  const handleCustomExpr = () => {
    setSelectedPreset(null);
    // Validate
    try {
      const testFn = new Function('x', `return (${expr});`);
      const val = testFn(1);
      if (typeof val !== 'number') {
        setCustomError('Expression must return a number');
        return;
      }
      setCustomError(null);
    } catch (e: any) {
      setCustomError(e.message || 'Invalid expression');
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar controls */}
      <aside className="w-56 shrink-0 border-r border-[var(--site-border)] bg-[var(--site-bg-subtle)] p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Presets</label>
          <div className="grid grid-cols-1 gap-1">
            {PRESET_FUNCTIONS.map((p, i) => (
              <button
                key={i}
                onClick={() => handlePresetSelect(i)}
                className={`text-left px-2.5 py-1.5 rounded-md text-xs font-mono transition-all ${
                  selectedPreset === i
                    ? 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30'
                    : 'text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]'
                }`}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--site-border)] pt-3 space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Custom</label>
          <input
            value={expr}
            onChange={e => setExpr(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCustomExpr()}
            className="w-full px-2.5 py-1.5 rounded-md text-xs font-mono bg-[var(--site-surface)] text-[var(--site-text)] border border-[var(--site-border)] focus:outline-none focus:border-[var(--site-accent)]"
            placeholder="Math.sin(x) * Math.cos(x)"
          />
          <div className="flex gap-2">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-8 h-7 rounded cursor-pointer bg-transparent border border-[var(--site-border)]"
            />
            <button
              onClick={handleCustomExpr}
              className="flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--site-accent)] text-white hover:opacity-90 transition-opacity"
            >
              Plot
            </button>
          </div>
          {customError && (
            <p className="text-[10px] text-red-400 font-mono">{customError}</p>
          )}
          <p className="text-[10px] text-[var(--site-text-dim)] font-mono leading-relaxed">
            Use x as variable.<br />
            Available: sin, cos, tan, abs, sqrt, exp, log, PI, E, pow
          </p>
        </div>

        <div className="border-t border-[var(--site-border)] pt-3 space-y-1.5 mt-auto">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Controls</label>
          <div className="text-[10px] text-[var(--site-text-dim)] space-y-0.5">
            <p>Drag to pan</p>
            <p>Scroll to zoom</p>
          </div>
          <button
            onClick={() => { setZoom(50); setPanX(0); setPanY(0); }}
            className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)] transition-all"
          >
            Reset View
          </button>
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Parametric Curves
   ────────────────────────────────────────────── */

const PARAMETRIC_PRESETS: {
  label: string;
  desc: string;
  fx: (t: number) => number;
  fy: (t: number) => number;
  tRange: [number, number];
  color: string;
}[] = [
  {
    label: 'Circle',
    desc: '(cos t, sin t)',
    fx: t => Math.cos(t),
    fy: t => Math.sin(t),
    tRange: [0, Math.PI * 2],
    color: '#ff6b6b',
  },
  {
    label: 'Ellipse',
    desc: '(2cos t, sin t)',
    fx: t => 2 * Math.cos(t),
    fy: t => Math.sin(t),
    tRange: [0, Math.PI * 2],
    color: '#4ecdc4',
  },
  {
    label: 'Spiral',
    desc: '(t·cos t, t·sin t)',
    fx: t => t * Math.cos(t),
    fy: t => t * Math.sin(t),
    tRange: [0, Math.PI * 6],
    color: '#a29bfe',
  },
  {
    label: 'Lissajous (3,2)',
    desc: '(sin(3t), sin(2t))',
    fx: t => Math.sin(3 * t),
    fy: t => Math.sin(2 * t),
    tRange: [0, Math.PI * 2],
    color: '#fd79a8',
  },
  {
    label: 'Lissajous (5,4)',
    desc: '(sin(5t), sin(4t))',
    fx: t => Math.sin(5 * t),
    fy: t => Math.sin(4 * t),
    tRange: [0, Math.PI * 2],
    color: '#00b894',
  },
  {
    label: 'Cardioid',
    desc: '(2cos t - cos 2t, 2sin t - sin 2t)',
    fx: t => 2 * Math.cos(t) - Math.cos(2 * t),
    fy: t => 2 * Math.sin(t) - Math.sin(2 * t),
    tRange: [0, Math.PI * 2],
    color: '#e17055',
  },
  {
    label: 'Butterfly',
    desc: '(sin t·(e^cos t - 2cos 4t), cos t·(e^cos t - 2cos 4t))',
    fx: t => Math.sin(t) * (Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t)),
    fy: t => Math.cos(t) * (Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t)),
    tRange: [0, Math.PI * 2],
    color: '#6c5ce7',
  },
  {
    label: 'Astroid',
    desc: '(cos³t, sin³t)',
    fx: t => Math.pow(Math.cos(t), 3),
    fy: t => Math.pow(Math.sin(t), 3),
    tRange: [0, Math.PI * 2],
    color: '#fdcb6e',
  },
  {
    label: 'Figure 8',
    desc: '(sin t, sin 2t / 2)',
    fx: t => Math.sin(t),
    fy: t => Math.sin(2 * t) * 0.5,
    tRange: [0, Math.PI * 2],
    color: '#e84393',
  },
];

function ParametricCurves() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(80);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [tParam, setTParam] = useState(0);
  const animRef = useRef<number>(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const preset = PARAMETRIC_PRESETS[selected];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preset) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = 'var(--site-bg, #1a1b1e)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + panX, h / 2 + panY);

    // Grid
    const step = zoom;
    const gridExt = Math.max(w, h) * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = -gridExt; x <= gridExt; x += step) {
      ctx.beginPath(); ctx.moveTo(x, -gridExt); ctx.lineTo(x, gridExt); ctx.stroke();
    }
    for (let y = -gridExt; y <= gridExt; y += step) {
      ctx.beginPath(); ctx.moveTo(-gridExt, y); ctx.lineTo(gridExt, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-gridExt, 0); ctx.lineTo(gridExt, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -gridExt); ctx.lineTo(0, gridExt); ctx.stroke();

    // Plot full curve
    const [tMin, tMax] = preset.tRange;
    const samples = 2000;
    ctx.strokeStyle = preset.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= samples; i++) {
      const t = tMin + (tMax - tMin) * (i / samples);
      const x = preset.fx(t) * zoom;
      const y = -preset.fy(t) * zoom;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw animated point
    if (animating) {
      const ax = preset.fx(tParam) * zoom;
      const ay = -preset.fy(tParam) * zoom;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = preset.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Trail
      const trailLen = 50;
      ctx.strokeStyle = preset.color + '40';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < trailLen; i++) {
        const tt = tParam - (tMax - tMin) * (i / trailLen) * 0.02;
        if (tt < tMin) break;
        const tx = preset.fx(tt) * zoom;
        const ty = -preset.fy(tt) * zoom;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [preset, zoom, panX, panY, animating, tParam]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Animation loop
  useEffect(() => {
    if (!animating) {
      cancelAnimationFrame(animRef.current);
      return;
    }
    const [tMin, tMax] = preset.tRange;
    const speed = 0.005;
    let running = true;

    const loop = () => {
      if (!running) return;
      setTParam(prev => {
        const next = prev + speed * (tMax - tMin);
        return next > tMax ? tMin : next;
      });
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [animating, preset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPanX(p => p + e.clientX - lastMouse.current.x);
    setPanY(p => p + e.clientY - lastMouse.current.y);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(5, Math.min(500, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-[var(--site-border)] bg-[var(--site-bg-subtle)] p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Curves</label>
          <div className="grid grid-cols-1 gap-1">
            {PARAMETRIC_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelected(i); setTParam(p.tRange[0]); }}
                className={`text-left px-2.5 py-1.5 rounded-md transition-all ${
                  selected === i
                    ? 'bg-[var(--site-accent-dim)] border border-[var(--site-accent)]/30'
                    : 'hover:bg-[var(--site-surface)]'
                }`}
              >
                <div className="text-xs font-medium text-[var(--site-text)]">{p.label}</div>
                <div className="text-[10px] font-mono text-[var(--site-text-dim)]">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--site-border)] pt-3 space-y-2 mt-auto">
          <button
            onClick={() => setAnimating(a => !a)}
            className={`w-full px-3 py-2 rounded-md text-xs font-medium transition-all ${
              animating
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30 hover:opacity-80'
            }`}
          >
            {animating ? '⏹ Stop Animation' : '▶ Animate Trace'}
          </button>
          <button
            onClick={() => { setZoom(80); setPanX(0); setPanY(0); setTParam(preset.tRange[0]); }}
            className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]"
          >
            Reset View
          </button>
        </div>
      </aside>

      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   3D Surface Plot
   ────────────────────────────────────────────── */

const SURFACE_PRESETS: {
  label: string;
  fn: (x: number, y: number) => number;
  desc: string;
}[] = [
  { label: 'Saddle', desc: 'x² - y²', fn: (x, y) => x * x - y * y },
  { label: 'Paraboloid', desc: 'x² + y²', fn: (x, y) => x * x + y * y },
  { label: 'Ripple', desc: 'sin(√(x²+y²))', fn: (x, y) => Math.sin(Math.sqrt(x * x + y * y)) },
  { label: 'Wave', desc: 'sin(x)·cos(y)', fn: (x, y) => Math.sin(x) * Math.cos(y) },
  { label: 'Sombrero', desc: 'sinc(√(x²+y²))', fn: (x, y) => {
    const r = Math.sqrt(x * x + y * y);
    return r < 0.001 ? 1 : Math.sin(r) / r;
  }},
  { label: 'Torus', desc: 'sin(√((R-√(x²+y²))²+z²))', fn: (x, y) => {
    const R = 2;
    const r = Math.sqrt(x * x + y * y);
    return Math.sin(Math.sqrt((R - r) * (R - r) + y * y));
  }},
  { label: 'Rings', desc: 'cos(x)·cos(y)', fn: (x, y) => Math.cos(x) * Math.cos(y) },
  { label: 'Cliff', desc: 'tanh(3x) + 0.2y', fn: (x, y) => Math.tanh(3 * x) + 0.2 * y },
];

function SurfacePlot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState(0);
  const [rotX, setRotX] = useState(30);
  const [rotY, setRotY] = useState(-30);
  const [scale, setScale] = useState(30);
  const [autoRotate, setAutoRotate] = useState(true);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const rotYRef = useRef(rotY);

  const preset = SURFACE_PRESETS[selected];
  const gridSize = 30;
  const range = 3;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !preset) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2 + 20);

    // Rotation matrices
    const rx = rotX * Math.PI / 180;
    const ry = rotY * Math.PI / 180;
    const cosRx = Math.cos(rx), sinRx = Math.sin(rx);
    const cosRy = Math.cos(ry), sinRy = Math.sin(ry);

    const project = (x: number, y: number, z: number): [number, number] => {
      // Rotate around X
      let y1 = y * cosRx - z * sinRx;
      let z1 = y * sinRx + z * cosRx;
      // Rotate around Y
      let x1 = x * cosRy + z1 * sinRy;
      let z2 = -x * sinRy + z1 * cosRy;
      return [x1 * scale, -y1 * scale];
    };

    // Generate mesh
    const step = (2 * range) / gridSize;
    const points: number[][][] = [];

    for (let i = 0; i <= gridSize; i++) {
      points[i] = [];
      for (let j = 0; j <= gridSize; j++) {
        const x = -range + i * step;
        const y = -range + j * step;
        const z = preset.fn(x, y);
        const clamped = Math.max(-5, Math.min(5, z));
        const [px, py] = project(x, y, clamped);
        points[i][j] = [px, py, clamped];
      }
    }

    // Sort cells by depth (painter's algorithm)
    const cells: { i: number; j: number; depth: number }[] = [];
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const avgZ = (points[i][j][2] + points[i + 1][j][2] + points[i][j + 1][2] + points[i + 1][j + 1][2]) / 4;
        cells.push({ i, j, depth: avgZ });
      }
    }
    cells.sort((a, b) => b.depth - a.depth);

    // Draw filled quads
    for (const { i, j } of cells) {
      const p00 = points[i][j];
      const p10 = points[i + 1][j];
      const p01 = points[i][j + 1];
      const p11 = points[i + 1][j + 1];

      const avgZ = (p00[2] + p10[2] + p01[2] + p11[2]) / 4;
      const normalized = (avgZ + 3) / 6;

      // Color gradient based on height
      const r = Math.round(20 + normalized * 200);
      const g = Math.round(10 + normalized * 150);
      const b = Math.round(80 + normalized * 175);
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.beginPath();
      ctx.moveTo(p00[0], p00[1]);
      ctx.lineTo(p10[0], p10[1]);
      ctx.lineTo(p11[0], p11[1]);
      ctx.lineTo(p01[0], p01[1]);
      ctx.closePath();
      ctx.fill();

      // Wireframe edges
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }, [preset, rotX, rotY, scale]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Auto-rotate
  useEffect(() => {
    if (!autoRotate) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      rotYRef.current += 0.3;
      setRotY(rotYRef.current);
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(id); };
  }, [autoRotate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setAutoRotate(false);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setRotY(r => r + dx * 0.5);
    setRotX(r => Math.max(-90, Math.min(90, r - dy * 0.5)));
    rotYRef.current += dx * 0.5;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(5, Math.min(150, s * (e.deltaY > 0 ? 0.92 : 1.08))));
  };

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-[var(--site-border)] bg-[var(--site-bg-subtle)] p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Surfaces</label>
          <div className="grid grid-cols-1 gap-1">
            {SURFACE_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelected(i); setAutoRotate(true); }}
                className={`text-left px-2.5 py-1.5 rounded-md transition-all ${
                  selected === i
                    ? 'bg-[var(--site-accent-dim)] border border-[var(--site-accent)]/30'
                    : 'hover:bg-[var(--site-surface)]'
                }`}
              >
                <div className="text-xs font-medium text-[var(--site-text)]">{p.label}</div>
                <div className="text-[10px] font-mono text-[var(--site-text-dim)]">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--site-border)] pt-3 space-y-2 mt-auto">
          <button
            onClick={() => setAutoRotate(a => !a)}
            className={`w-full px-3 py-2 rounded-md text-xs font-medium transition-all ${
              autoRotate
                ? 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30'
                : 'bg-[var(--site-surface)] text-[var(--site-text-muted)] border border-[var(--site-border)]'
            }`}
          >
            {autoRotate ? '🔁 Auto-rotate ON' : '⏸ Auto-rotate OFF'}
          </button>
          <button
            onClick={() => { setRotX(30); setRotY(-30); setScale(30); rotYRef.current = -30; setAutoRotate(true); }}
            className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]"
          >
            Reset View
          </button>
          <div className="text-[10px] text-[var(--site-text-dim)] space-y-0.5 pt-1">
            <p>Drag to orbit</p>
            <p>Scroll to zoom</p>
          </div>
        </div>
      </aside>

      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Fractal Viewer (Mandelbrot / Julia)
   ────────────────────────────────────────────── */

function FractalViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fractalType, setFractalType] = useState<'mandelbrot' | 'julia'>('mandelbrot');
  const [zoom, setZoom] = useState(1.5);
  const [centerX, setCenterX] = useState(-0.5);
  const [centerY, setCenterY] = useState(0);
  const [maxIter, setMaxIter] = useState(100);
  const [juliaCX, setJuliaCX] = useState(-0.7);
  const [juliaCY, setJuliaCY] = useState(0.27);
  const [colorScheme, setColorScheme] = useState(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });

  const colorSchemes = [
    { name: 'Classic', fn: (n: number, max: number): [number, number, number] => {
      if (n >= max) return [0, 0, 0];
      const t = n / max;
      return [
        Math.round(9 * (1 - t) * t * t * t * 255),
        Math.round(15 * (1 - t) * (1 - t) * t * t * 255),
        Math.round(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255),
      ];
    }},
    { name: 'Fire', fn: (n: number, max: number): [number, number, number] => {
      if (n >= max) return [0, 0, 0];
      const t = n / max;
      return [
        Math.round(255 * Math.pow(t, 0.5)),
        Math.round(100 * Math.pow(t, 2)),
        Math.round(20 * Math.pow(t, 3)),
      ];
    }},
    { name: 'Ocean', fn: (n: number, max: number): [number, number, number] => {
      if (n >= max) return [0, 0, 0];
      const t = n / max;
      return [
        Math.round(10 * (1 - t) * 255),
        Math.round(50 * (1 - t) * t * 255 + 30),
        Math.round(200 * (1 - t) * t * 255 + 50),
      ];
    }},
    { name: 'Neon', fn: (n: number, max: number): [number, number, number] => {
      if (n >= max) return [0, 0, 0];
      const t = n / max;
      return [
        Math.round(255 * Math.sin(t * Math.PI * 2) ** 2),
        Math.round(255 * Math.sin((t + 0.33) * Math.PI * 2) ** 2),
        Math.round(255 * Math.sin((t + 0.67) * Math.PI * 2) ** 2),
      ];
    }},
    { name: 'Grayscale', fn: (n: number, max: number): [number, number, number] => {
      if (n >= max) return [0, 0, 0];
      const v = Math.round(255 * (1 - n / max));
      return [v, v, v];
    }},
  ];

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const imageData = ctx.createImageData(w * dpr, h * dpr);
    const data = imageData.data;
    const scheme = colorSchemes[colorScheme].fn;

    const aspect = w / h;
    const xRange = zoom * aspect;
    const yRange = zoom;

    for (let py = 0; py < h * dpr; py++) {
      for (let px = 0; px < w * dpr; px++) {
        const x = centerX + (px / (w * dpr) - 0.5) * xRange * 2;
        const y = centerY + (py / (h * dpr) - 0.5) * yRange * 2;

        let zx = 0, zy = 0;
        let cx = x, cy = y;

        if (fractalType === 'julia') {
          zx = x;
          zy = y;
          cx = juliaCX;
          cy = juliaCY;
        }

        let n = 0;
        while (n < maxIter) {
          const zx2 = zx * zx - zy * zy + cx;
          const zy2 = 2 * zx * zy + cy;
          zx = zx2;
          zy = zy2;
          if (zx * zx + zy * zy > 4) break;
          n++;
        }

        const [r, g, b] = scheme(n, maxIter);
        const idx = (py * w * dpr + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [fractalType, zoom, centerX, centerY, maxIter, juliaCX, juliaCY, colorScheme]);

  useEffect(() => {
    render();
    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dx = (e.clientX - lastMouse.current.x) / canvas.clientWidth * zoom * 2 * (canvas.clientWidth / canvas.clientHeight);
    const dy = (e.clientY - lastMouse.current.y) / canvas.clientHeight * zoom * 2;
    setCenterX(c => c - dx);
    setCenterY(c => c - dy);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.85;
    setZoom(z => Math.max(1e-12, Math.min(100, z * factor)));
  };

  const handleClick = (e: React.MouseEvent) => {
    const dist = Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y);
    if (dist > 5) return; // was a drag, not a click
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const aspect = rect.width / rect.height;
    const newCX = centerX + (mx - 0.5) * zoom * 2 * aspect;
    const newCY = centerY + (my - 0.5) * zoom * 2;
    setCenterX(newCX);
    setCenterY(newCY);
    setZoom(z => z * 0.5);
  };

  const presets = [
    { label: 'Mandelbrot Zoom 1', type: 'mandelbrot' as const, cx: -0.5, cy: 0, zoom: 1.5 },
    { label: 'Mandelbrot Zoom 2', type: 'mandelbrot' as const, cx: -0.7453, cy: 0.1127, zoom: 0.01 },
    { label: 'Mandelbrot Zoom 3', type: 'mandelbrot' as const, cx: -1.25, cy: 0, zoom: 0.25 },
    { label: 'Mandelbrot Zoom 4', type: 'mandelbrot' as const, cx: 0.285, cy: 0.01, zoom: 0.05 },
    { label: 'Julia Set 1', type: 'julia' as const, cx: -0.7, cy: 0.27, zoom: 1.5 },
    { label: 'Julia Set 2', type: 'julia' as const, cx: -0.4, cy: 0.6, zoom: 1.5 },
    { label: 'Julia Set 3', type: 'julia' as const, cx: 0.285, cy: 0.01, zoom: 1.5 },
    { label: 'Julia Set 4', type: 'julia' as const, cx: -0.8, cy: 0.156, zoom: 1.5 },
  ];

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-[var(--site-border)] bg-[var(--site-bg-subtle)] p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Type</label>
          <div className="flex gap-1">
            <button
              onClick={() => setFractalType('mandelbrot')}
              className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                fractalType === 'mandelbrot'
                  ? 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30'
                  : 'text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]'
              }`}
            >
              Mandelbrot
            </button>
            <button
              onClick={() => setFractalType('julia')}
              className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                fractalType === 'julia'
                  ? 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30'
                  : 'text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]'
              }`}
            >
              Julia
            </button>
          </div>
        </div>

        {fractalType === 'julia' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Julia Parameters</label>
            <div className="space-y-1">
              <div>
                <label className="text-[10px] text-[var(--site-text-dim)]">Real (c)</label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.001"
                  value={juliaCX}
                  onChange={e => setJuliaCX(parseFloat(e.target.value))}
                  className="w-full accent-[var(--site-accent)]"
                />
                <span className="text-[10px] font-mono text-[var(--site-text-muted)]">{juliaCX.toFixed(3)}</span>
              </div>
              <div>
                <label className="text-[10px] text-[var(--site-text-dim)]">Imag (c)</label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.001"
                  value={juliaCY}
                  onChange={e => setJuliaCY(parseFloat(e.target.value))}
                  className="w-full accent-[var(--site-accent)]"
                />
                <span className="text-[10px] font-mono text-[var(--site-text-muted)]">{juliaCY.toFixed(3)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Color Scheme</label>
          <div className="grid grid-cols-1 gap-1">
            {colorSchemes.map((s, i) => (
              <button
                key={i}
                onClick={() => setColorScheme(i)}
                className={`text-left px-2.5 py-1.5 rounded-md text-xs transition-all ${
                  colorScheme === i
                    ? 'bg-[var(--site-accent-dim)] text-[var(--site-accent)] border border-[var(--site-accent)]/30'
                    : 'text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">
            Iterations: {maxIter}
          </label>
          <input
            type="range"
            min="20"
            max="500"
            step="10"
            value={maxIter}
            onChange={e => setMaxIter(parseInt(e.target.value))}
            className="w-full accent-[var(--site-accent)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--site-text-muted)]">Locations</label>
          <div className="grid grid-cols-1 gap-1">
            {presets.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setFractalType(p.type);
                  setCenterX(p.cx);
                  setCenterY(p.cy);
                  setZoom(p.zoom);
                  if (p.type === 'julia') {
                    setJuliaCX(p.cx);
                    setJuliaCY(p.cy);
                  }
                }}
                className="text-left px-2.5 py-1.5 rounded-md text-[10px] text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)] transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--site-border)] pt-3 space-y-1.5 mt-auto">
          <div className="text-[10px] text-[var(--site-text-dim)] space-y-0.5">
            <p>Drag to pan</p>
            <p>Click to zoom in</p>
            <p>Scroll to zoom out</p>
          </div>
          <button
            onClick={() => { setZoom(1.5); setCenterX(-0.5); setCenterY(0); setMaxIter(100); }}
            className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--site-text-muted)] hover:text-[var(--site-text)] hover:bg-[var(--site-surface)]"
          >
            Reset View
          </button>
        </div>
      </aside>

      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>
    </div>
  );
}
