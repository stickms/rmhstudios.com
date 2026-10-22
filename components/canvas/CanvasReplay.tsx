'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/http';
import { CANVAS_PALETTE, type CanvasEventView } from '@/lib/canvas/shared';

interface LogPage {
  cells: number[];
  last: number;
  done: boolean;
}

const PLAY_SECONDS = 15;

/** Timelapse of a finished canvas, rebuilt from the placement log. */
export default function CanvasReplay({ event }: { event: CanvasEventView }) {
  const { t } = useTranslation('f-canvas');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cells, setCells] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const drawn = useRef(Infinity);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: number[] = [];
      let after = 0;
      for (;;) {
        const page = await fetchJson<LogPage>(`/api/canvas/log?id=${event.id}&after=${after}`);
        for (const c of page.cells) all.push(c);
        if (page.done) break;
        after = page.last;
      }
      if (alive) setCells(all);
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [event.id]);

  const drawTo = useCallback(
    (to: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !cells) return;
      if (to < drawn.current) {
        ctx.fillStyle = CANVAS_PALETTE[0];
        ctx.fillRect(0, 0, event.width, event.height);
        drawn.current = 0;
      }
      for (let i = drawn.current; i < to; i++) {
        const cell = cells[i];
        const idx = cell >> 4;
        ctx.fillStyle = CANVAS_PALETTE[cell & 15];
        ctx.fillRect(idx % event.width, Math.floor(idx / event.width), 1, 1);
      }
      drawn.current = to;
    },
    [cells, event.width, event.height],
  );

  useEffect(() => drawTo(pos), [pos, drawTo]);

  useEffect(() => {
    if (!playing || !cells) return;
    const step = Math.max(1, Math.ceil(cells.length / (PLAY_SECONDS * 60)));
    let raf = 0;
    const tick = () => {
      let done = false;
      setPos((p) => {
        const n = Math.min(cells.length, p + step);
        done = n >= cells.length;
        return n;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, cells]);

  if (failed) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('replay-failed', { defaultValue: 'The replay could not be loaded.' })}
      </p>
    );
  }
  if (!cells) return <Skeleton className="mx-auto aspect-square w-full max-w-lg" />;
  if (cells.length === 0) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('replay-empty', { defaultValue: 'Nobody placed a pixel on this canvas.' })}
      </p>
    );
  }
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <canvas
        ref={canvasRef}
        width={event.width}
        height={event.height}
        role="img"
        aria-label={t('replay-label', { defaultValue: 'Timelapse of the finished canvas' })}
        className="glass-inset aspect-square w-full rounded-site"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={
            playing
              ? t('replay-pause', { defaultValue: 'Pause' })
              : t('replay-play', { defaultValue: 'Play' })
          }
          onClick={() => {
            if (pos >= cells.length) setPos(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <input
          type="range"
          min={0}
          max={cells.length}
          value={pos}
          onChange={(e) => {
            setPlaying(false);
            setPos(Number(e.target.value));
          }}
          aria-label={t('replay-scrub', { defaultValue: 'Replay position' })}
          className="w-full accent-[var(--site-accent)]"
        />
      </div>
      <p className="text-xs text-site-text-muted">
        {t('replay-count', {
          defaultValue: '{{done}} of {{total}} pixels',
          done: pos,
          total: cells.length,
        })}
      </p>
    </div>
  );
}
