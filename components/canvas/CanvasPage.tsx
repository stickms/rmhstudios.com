'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Film, Grid2x2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/http';
import { CANVAS_PALETTE, type CanvasEventView } from '@/lib/canvas/shared';
import type { Cell } from './CanvasBoard';

const CanvasBoard = lazy(() => import('./CanvasBoard'));
const CanvasReplay = lazy(() => import('./CanvasReplay'));

interface CanvasData {
  event: CanvasEventView | null;
  past: CanvasEventView[];
}

function useCountdown(nextAt: string | null | undefined): number {
  const target = nextAt ? Date.parse(nextAt) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [target]);
  return Math.max(0, Math.ceil((target - now) / 1000));
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Z5 — /canvas: the community pixel canvas, live while an event runs and a timelapse after. */
export function CanvasPage() {
  const { t } = useTranslation('f-canvas');
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [color, setColor] = useState(5);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(false);
  const [nextAt, setNextAt] = useState<string | null>(null);
  const paintRef = useRef<((x: number, y: number, c: number) => void) | null>(null);

  const q = useQuery({
    queryKey: ['canvas', session?.user?.id ?? null],
    queryFn: () => fetchJson<CanvasData>('/api/canvas'),
  });
  const base = q.data?.event ?? null;
  // A past event picked from the archive replaces the current one for viewing only.
  const event = (picked ? q.data?.past.find((p) => p.id === picked) : null) ?? base;
  const wait = useCountdown(nextAt ?? base?.nextAt);

  useEffect(() => {
    setNextAt(null);
    setSelected(null);
    setReplay(false);
  }, [event?.id]);

  const place = async () => {
    if (!event || !selected) return;
    setBusy(true);
    try {
      const r = await fetchJson<{ nextAt: string }>('/api/canvas/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, ...selected, color }),
      });
      paintRef.current?.(selected.x, selected.y, color);
      setNextAt(r.nextAt);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('place-error', { defaultValue: 'Could not place that' }),
      );
      await qc.invalidateQueries({ queryKey: ['canvas'] });
    } finally {
      setBusy(false);
    }
  };

  const live = event?.phase === 'live';
  return (
    <PageLayout
      title={t('title', { defaultValue: 'Community canvas' })}
      description={t('desc', {
        defaultValue:
          'One shared canvas. Everyone places one pixel at a time, and the picture only exists because of all of us.',
      })}
    >
      <div className="space-y-4 px-4 pt-2 pb-12">
        {q.isPending ? (
          <Skeleton className="h-[60vh] w-full" />
        ) : !event ? (
          <EmptyState
            icon={Grid2x2}
            title={t('none', { defaultValue: 'No canvas event yet' })}
            description={t('none-desc', {
              defaultValue: 'When the next canvas opens it will appear here.',
            })}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-site-text">{event.title}</h2>
              <p className="text-sm text-site-text-muted">
                {event.phase === 'upcoming'
                  ? t('opens', {
                      defaultValue: 'Opens {{date}}',
                      date: new Date(event.startsAt).toLocaleString(),
                    })
                  : live
                    ? t('closes', {
                        defaultValue: 'Closes {{date}}',
                        date: new Date(event.endsAt).toLocaleString(),
                      })
                    : t('closed', { defaultValue: 'Closed' })}
              </p>
            </div>
            {event.phase !== 'upcoming' && (
              <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
                <CanvasBoard
                  event={event}
                  selected={selected}
                  onSelect={setSelected}
                  paintRef={paintRef}
                />
              </Suspense>
            )}
            {live && (
              <section className="glass-pane space-y-3 rounded-site p-4">
                <div
                  role="radiogroup"
                  aria-label={t('palette', { defaultValue: 'Colour' })}
                  className="flex flex-wrap gap-1.5"
                >
                  {CANVAS_PALETTE.map((hex, i) => (
                    <button
                      key={hex}
                      type="button"
                      role="radio"
                      aria-checked={color === i}
                      aria-label={t('colour-n', { defaultValue: 'Colour {{n}}', n: i + 1 })}
                      onClick={() => setColor(i)}
                      className="size-8 rounded-site border border-site-border outline-offset-2 aria-checked:outline-2 aria-checked:outline-site-accent"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                {session ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="accent"
                      loading={busy}
                      disabled={!selected || wait > 0}
                      onClick={() => void place()}
                    >
                      {wait > 0
                        ? t('wait', { defaultValue: 'Next pixel in {{time}}', time: fmt(wait) })
                        : t('place', { defaultValue: 'Place pixel' })}
                    </Button>
                    <span className="text-sm text-site-text-muted">
                      {selected
                        ? t('at', {
                            defaultValue: 'Pixel {{x}}, {{y}}',
                            x: selected.x,
                            y: selected.y,
                          })
                        : t('pick', { defaultValue: 'Tap the canvas to pick a pixel' })}
                    </span>
                    <span className="text-xs text-site-text-muted">
                      {t('cooldown', {
                        defaultValue: 'One pixel every {{minutes}} min',
                        minutes: Math.round(event.cooldownSec / 60),
                      })}
                    </span>
                  </div>
                ) : (
                  <SignedOutPrompt
                    icon={Grid2x2}
                    title={t('signed-out', { defaultValue: 'Sign in to place pixels' })}
                    callbackURL="/canvas"
                  />
                )}
              </section>
            )}
            {event.phase === 'ended' && (
              <section className="space-y-3">
                {replay ? (
                  <Suspense
                    fallback={<Skeleton className="mx-auto aspect-square w-full max-w-lg" />}
                  >
                    <CanvasReplay event={event} />
                  </Suspense>
                ) : (
                  <Button variant="secondary" onClick={() => setReplay(true)}>
                    <Film />
                    {t('replay', { defaultValue: 'Watch the timelapse' })}
                  </Button>
                )}
              </section>
            )}
          </>
        )}
        {!!q.data?.past.length && (
          <nav
            aria-label={t('earlier', { defaultValue: 'Earlier canvases' })}
            className="space-y-2"
          >
            <h2 className="text-sm font-semibold text-site-text">
              {t('earlier', { defaultValue: 'Earlier canvases' })}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {[...(base ? [base] : []), ...q.data.past].map((p) => (
                <li key={p.id}>
                  <Button
                    size="sm"
                    variant={event?.id === p.id ? 'accent' : 'secondary'}
                    aria-pressed={event?.id === p.id}
                    onClick={() => setPicked(p.id === base?.id ? null : p.id)}
                  >
                    {p.title}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </PageLayout>
  );
}
