'use client';

/** Warm-up aim range (timed flick drill) and crosshair editor with import/export codes. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Crosshair as CrosshairIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  decodeCrosshair,
  encodeCrosshair,
  getCrosshair,
  setCrosshair,
  type CrosshairSettings,
} from '@/lib/breakpoint/crosshair';
import { Crosshair } from './Crosshair';

const DRILL_MS = 30_000;
const TARGET_LIFE_MS = 1300;
const BEST_KEY = 'bp.range.best';

interface Target {
  id: number;
  x: number;
  y: number;
  size: number;
  born: number;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function CrosshairEditor() {
  const { t } = useTranslation('f-action');
  const [c, setC] = useState<CrosshairSettings>(() => getCrosshair());
  const [code, setCode] = useState('');
  const update = (patch: Partial<CrosshairSettings>) => {
    const next = { ...c, ...patch };
    setC(next);
    setCrosshair(next);
  };
  const row = (
    label: string,
    key: 'length' | 'thickness' | 'gap' | 'opacity',
    min: number,
    max: number,
  ) => (
    <label className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
      <span>{label}</span>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[c[key]]}
        onValueChange={([v]) => update({ [key]: v })}
      />
      <span className="tabular-nums text-site-text-muted">{c[key]}</span>
    </label>
  );
  return (
    <section className="space-y-3" aria-label={t('bp-xhair-title', { defaultValue: 'Crosshair' })}>
      <h3 className="text-sm font-semibold">
        {t('bp-xhair-title', { defaultValue: 'Crosshair' })}
      </h3>
      <div
        className="relative mx-auto h-24 w-full max-w-xs glass-inset rounded-site"
        role="img"
        aria-label={t('bp-xhair-preview', { defaultValue: 'Crosshair preview' })}
      >
        <Crosshair settings={c} />
      </div>
      <label className="grid grid-cols-[6rem_1fr] items-center gap-3 text-sm">
        <span>{t('bp-xhair-color', { defaultValue: 'Colour' })}</span>
        <input
          type="color"
          value={`#${c.color}`}
          onChange={(e) => update({ color: e.target.value.slice(1) })}
          className="h-8 w-16 cursor-pointer rounded-site bg-transparent"
        />
      </label>
      {row(t('bp-xhair-length', { defaultValue: 'Length' }), 'length', 1, 20)}
      {row(t('bp-xhair-thickness', { defaultValue: 'Thickness' }), 'thickness', 1, 6)}
      {row(t('bp-xhair-gap', { defaultValue: 'Gap' }), 'gap', 0, 16)}
      {row(t('bp-xhair-opacity', { defaultValue: 'Opacity' }), 'opacity', 20, 100)}
      <div className="flex items-center justify-between text-sm">
        <span id="bp-xhair-dot">{t('bp-xhair-dot', { defaultValue: 'Centre dot' })}</span>
        <Switch
          aria-labelledby="bp-xhair-dot"
          checked={c.dot}
          onCheckedChange={(dot) => update({ dot })}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <code className="glass-inset flex-1 truncate rounded-site px-2 py-1.5 text-xs">
            {encodeCrosshair(c)}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(encodeCrosshair(c)).then(
                () => toast.success(t('bp-xhair-copied', { defaultValue: 'Code copied' })),
                () =>
                  toast.error(
                    t('bp-xhair-copy-failed', { defaultValue: 'Could not copy the code' }),
                  ),
              );
            }}
          >
            <Copy aria-hidden /> {t('bp-xhair-copy', { defaultValue: 'Copy' })}
          </Button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = decodeCrosshair(code);
            if (!parsed) {
              toast.error(
                t('bp-xhair-bad-code', { defaultValue: 'That is not a valid crosshair code' }),
              );
              return;
            }
            setC(parsed);
            setCrosshair(parsed);
            setCode('');
            toast.success(t('bp-xhair-imported', { defaultValue: 'Crosshair imported' }));
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="RO1-19f6c2-7-2-4-0-100"
            aria-label={t('bp-xhair-import-label', { defaultValue: 'Crosshair code to import' })}
          />
          <Button type="submit" size="sm" disabled={!code.trim()}>
            {t('bp-xhair-import', { defaultValue: 'Import' })}
          </Button>
        </form>
      </div>
    </section>
  );
}

function Drill() {
  const { t } = useTranslation('f-action');
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(DRILL_MS);
  const [target, setTarget] = useState<Target | null>(null);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [shots, setShots] = useState(0);
  const [best, setBest] = useState(0);
  const [finished, setFinished] = useState(false);
  const nextId = useRef(1);
  const endAt = useRef(0);

  useEffect(() => setBest(readBest()), []);

  const spawn = useCallback(() => {
    setTarget({
      id: nextId.current++,
      x: 8 + Math.random() * 84,
      y: 10 + Math.random() * 80,
      size: 28 + Math.random() * 28,
      born: performance.now(),
    });
  }, []);

  const start = () => {
    setScore(0);
    setHits(0);
    setShots(0);
    setFinished(false);
    setLeft(DRILL_MS);
    endAt.current = performance.now() + DRILL_MS;
    setRunning(true);
    spawn();
  };

  // Clock + target expiry: 10 Hz, only while a drill runs.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      const remaining = endAt.current - now;
      if (remaining <= 0) {
        setRunning(false);
        setTarget(null);
        setLeft(0);
        setFinished(true);
        return;
      }
      setLeft(remaining);
      setTarget((cur) => (cur && now - cur.born > TARGET_LIFE_MS ? null : cur));
    }, 100);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && target === null) spawn();
  }, [running, target, spawn]);

  useEffect(() => {
    if (!finished) return;
    setBest((prev) => {
      if (score <= prev) return prev;
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* storage blocked */
      }
      return score;
    });
  }, [finished, score]);

  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  return (
    <section
      className="space-y-3"
      aria-label={t('bp-range-title', { defaultValue: 'Flick drill' })}
    >
      <h3 className="text-sm font-semibold">
        {t('bp-range-title', { defaultValue: 'Flick drill' })}
      </h3>
      <div
        className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums"
        aria-live="off"
      >
        <span>{t('bp-range-score', { defaultValue: 'Score {{n}}', n: score })}</span>
        <span>{t('bp-range-accuracy', { defaultValue: 'Accuracy {{n}}%', n: accuracy })}</span>
        <span>
          {t('bp-range-time', { defaultValue: '{{n}}s left', n: Math.ceil(left / 1000) })}
        </span>
        <span>{t('bp-range-best', { defaultValue: 'Best {{n}}', n: best })}</span>
      </div>
      <div
        className="glass-inset relative h-56 w-full select-none overflow-hidden rounded-site"
        style={{ cursor: 'crosshair', touchAction: 'manipulation' }}
        onPointerDown={() => {
          if (running) setShots((s) => s + 1);
        }}
      >
        {target && (
          <button
            key={target.id}
            type="button"
            aria-label={t('bp-range-target', { defaultValue: 'Target' })}
            className="absolute rounded-full border-2 border-site-text bg-site-danger"
            style={{
              left: `${target.x}%`,
              top: `${target.y}%`,
              width: target.size,
              height: target.size,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!running) return;
              const quick = Math.max(0, TARGET_LIFE_MS - (performance.now() - target.born));
              setShots((s) => s + 1);
              setHits((h) => h + 1);
              setScore((s) => s + 100 + Math.round(quick / 10));
              spawn();
            }}
          />
        )}
        {!running && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-site-text-muted">
            {finished
              ? t('bp-range-done', { defaultValue: 'Time. Score {{n}}.', n: score })
              : t('bp-range-idle', {
                  defaultValue: 'Hit every target before it fades. 30 seconds.',
                })}
          </div>
        )}
      </div>
      <Button onClick={start} disabled={running}>
        {finished
          ? t('bp-range-again', { defaultValue: 'Run it again' })
          : t('bp-range-start', { defaultValue: 'Start drill' })}
      </Button>
      <p className="text-xs text-site-text-muted">
        {t('bp-range-note', {
          defaultValue: 'Warm-up only. It never touches a match, ranks or boards.',
        })}
      </p>
    </section>
  );
}

export function AimRangeButton() {
  const { t } = useTranslation('f-action');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="bp-cta bp-cta-ghost">
          <CrosshairIcon aria-hidden className="mr-2 inline size-4" />
          {t('bp-range-open', { defaultValue: 'AIM RANGE & CROSSHAIR' })}
        </button>
      </DialogTrigger>
      <DialogContent mobileFullscreen className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bp-range-heading', { defaultValue: 'Aim range' })}</DialogTitle>
          <DialogDescription>
            {t('bp-range-desc', {
              defaultValue: 'Warm up, then tune your crosshair. Share it as a short code.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <Drill />
          <CrosshairEditor />
        </div>
      </DialogContent>
    </Dialog>
  );
}
