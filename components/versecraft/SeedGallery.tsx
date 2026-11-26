/**
 * Versecraft seed gallery (R13): publish a seed you have played, browse and rate
 * other people's, and "continue this story" to fork one into your own run — your
 * name and cast, their world.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { BookOpen, Flag, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StarRating } from '@/components/games/StarRating';
import { api } from '@/lib/contract/client';
import { fetchWithTimeout } from '@/lib/versecraft/gen/client';
import { deleteVersecraftSeedApi, forkVersecraftSeedApi } from '@/lib/versecraft/versecraft.contract';
import { useGameStore } from '@/lib/versecraft/store';
import type { SeedListingView } from '@/lib/versecraft/seed-gallery';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

// The report dialog carries the report schema (zod), so it loads when a member opens it and not with the game.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

type Sort = 'top' | 'new';

export function SeedGalleryButton() {
  const { t } = useTranslation('f-async-games');
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('top');
  const [rows, setRows] = useState<SeedListingView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const arrival = useArrival(rows !== null || failed);
  const [reportId, setReportId] = useState<string | null>(null);
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const isLoggedIn = useGameStore((s) => s.isLoggedIn);
  const startGeneratedGame = useGameStore((s) => s.startGeneratedGame);

  const load = useCallback(async (which: Sort) => {
    setFailed(false);
    try {
      const res = await fetchWithTimeout(`/api/versecraft/seeds?sort=${which}`, {}, 15000);
      if (!res.ok) throw new Error(String(res.status));
      setRows(
        (
          (await res.json()) as {
            listings: SeedListingView[];
          }
        ).listings,
      );
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (open) void load(sort);
  }, [open, sort, load]);

  const rate = async (row: SeedListingView, stars: number) => {
    let res: Response | null = null;
    try {
      res = await fetchWithTimeout(
        '/api/versecraft/seeds/rate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listingId: row.id,
            stars,
          }),
        },
        15000,
      );
    } catch {
      res = null;
    }
    if (!res || !res.ok) {
      toast.error(
        t('gallery-rate-error', {
          defaultValue: 'Could not save your rating.',
        }),
      );
      return;
    }
    const body = (await res.json()) as {
      average: number;
      ratingCount: number;
    };
    setRows(
      (cur) =>
        cur?.map((r) =>
          r.id === row.id
            ? {
                ...r,
                myStars: stars,
                average: body.average,
                ratingCount: body.ratingCount,
              }
            : r,
        ) ?? cur,
    );
  };

  // The author takes their own story down (s15-04): the listing and its ratings go, the world stays.
  const takeDown = async (row: SeedListingView) => {
    const ok = await confirm({
      title: t('takedown-title', { ns: 'workshop-reports', defaultValue: 'Take this story down?' }),
      description: t('takedown-help', {
        ns: 'workshop-reports',
        defaultValue: 'It leaves the gallery with its ratings. Players who already continued it keep their copy.',
      }),
      confirmLabel: t('takedown-confirm', { ns: 'workshop-reports', defaultValue: 'Take down' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteVersecraftSeedApi, { params: { id: row.id } });
      setRows((cur) => cur?.filter((r) => r.id !== row.id) ?? cur);
      toast.success(
        t('takedown-done', { ns: 'workshop-reports', defaultValue: 'Taken down. You can publish another.' }),
      );
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ??
          t('takedown-error', { ns: 'workshop-reports', defaultValue: 'Could not take this story down.' }),
      );
    }
  };

  const fork = (row: SeedListingView) => {
    // Counted fire-and-forget: continuing the story must never wait on the tally.
    void api(forkVersecraftSeedApi, {
      body: {
        listingId: row.id,
      },
    }).catch(() => undefined);
    setOpen(false);
    void startGeneratedGame({
      seed: row.seed,
    });
  };

  return (
    <>
      <button
        className="w-full rounded px-4 py-2 text-sm transition hover:brightness-125"
        style={{
          backgroundColor: 'rgba(42, 34, 53, 0.6)',
          border: '1px solid rgba(196, 163, 90, 0.2)',
          color: '#e8e0d0',
        }}
        onClick={() => setOpen(true)}
      >
        <BookOpen className="me-2 inline size-4 align-text-bottom" aria-hidden />
        {t('gallery-open', {
          defaultValue: 'Browse the seed gallery',
        })}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('gallery-title', {
                defaultValue: 'Seed gallery',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('gallery-help', {
                defaultValue: 'Stories other players published. Continue one with your own name and cast.',
              })}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            aria-label={t('gallery-sort', {
              defaultValue: 'Sort seeds',
            })}
            value={sort}
            onChange={(id) => setSort(id as Sort)}
            tabs={[
              {
                id: 'top',
                label: t('gallery-sort-top', {
                  defaultValue: 'Top rated',
                }),
              },
              {
                id: 'new',
                label: t('gallery-sort-new', {
                  defaultValue: 'Newest',
                }),
              },
            ]}
          />
          {failed ? (
            <p className={cn('text-sm text-site-danger', arrival)}>
              {t('gallery-error', {
                defaultValue: 'The gallery did not load.',
              })}
            </p>
          ) : rows === null ? (
            <p className="text-sm text-site-text-muted">
              {t('gallery-loading', {
                defaultValue: 'Loading…',
              })}
            </p>
          ) : rows.length === 0 ? (
            <p className={cn('text-sm text-site-text-muted', arrival)}>
              {t('gallery-empty', {
                defaultValue: 'Nothing published yet. Finish a chapter and share yours.',
              })}
            </p>
          ) : (
            <ul className={cn('max-h-[55dvh] space-y-2 overflow-y-auto', arrival)}>
              {rows.map((row) => (
                <li key={row.id} className="surface-card space-y-2 rounded-site p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-sm font-semibold text-site-text">
                        {row.title}
                      </p>
                      <p className="truncate text-xs text-site-text-muted">
                        {t('gallery-by', {
                          defaultValue: 'by {{name}}',
                          name:
                            row.author ??
                            t('gallery-anon', {
                              defaultValue: 'a reader',
                            }),
                        })}
                        {' · '}
                        {t('gallery-forks', {
                          defaultValue_one: '{{count}} continuation',
                          defaultValue: '{{count}} continuations',
                          count: row.forks,
                        })}
                      </p>
                    </div>
                    <Button size="sm" variant="default" onClick={() => fork(row)}>
                      {t('gallery-continue', {
                        defaultValue: 'Continue this story',
                      })}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-site-text-muted">
                    <StarRating
                      value={row.myStars || Math.round(row.average)}
                      size={16}
                      label={t('gallery-rating', {
                        defaultValue: 'Rating',
                      })}
                      onRate={isLoggedIn && !row.mine ? (n) => void rate(row, n) : undefined}
                    />
                    <span>
                      {row.ratingCount
                        ? `${row.average} · ${row.ratingCount}`
                        : t('gallery-unrated', {
                            defaultValue: 'No ratings yet',
                          })}
                    </span>
                    {row.mine ? (
                      <Button size="xs" variant="ghost" onClick={() => void takeDown(row)}>
                        <Trash2 aria-hidden />
                        {t('takedown-open', { ns: 'workshop-reports', defaultValue: 'Take down' })}
                      </Button>
                    ) : isLoggedIn ? (
                      <Button size="xs" variant="ghost" onClick={() => setReportId(row.id)}>
                        <Flag aria-hidden />
                        {t('report-story', { ns: 'workshop-reports', defaultValue: 'Report' })}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {reportId !== null && (
        <Suspense fallback={null}>
          <ReportDialog
            open
            onOpenChange={(next) => {
              if (!next) setReportId(null);
            }}
            entityType="versecraft-seed"
            entityId={reportId}
          />
        </Suspense>
      )}
    </>
  );
}

/** "Publish this seed" — a title, then it joins the gallery. Signed-in members only. */
export function PublishSeedButton({ seed }: { seed: string }) {
  const { t } = useTranslation('f-async-games');
  const isLoggedIn = useGameStore((s) => s.isLoggedIn);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isLoggedIn) return null;

  const publish = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(
        '/api/versecraft/seeds',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seed,
            title: title.trim(),
          }),
        },
        15000,
      );
      if (res.ok) {
        toast.success(
          t('publish-done', {
            defaultValue: 'Published to the seed gallery.',
          }),
        );
        setOpen(false);
      } else if (res.status === 409) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(
          error === 'limit'
            ? t('publish-limit', {
                defaultValue: 'You have published the maximum number of seeds.',
              })
            : t('publish-dupe', {
                defaultValue: 'This seed is already in the gallery.',
              }),
        );
      } else if (res.status === 404) {
        toast.error(
          t('publish-unsaved', {
            defaultValue: 'This world is not saved yet. Play a little further, then try again.',
          }),
        );
      } else {
        throw new Error(String(res.status));
      }
    } catch {
      toast.error(
        t('publish-error', {
          defaultValue: 'Could not publish this seed.',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 pointer-coarse:min-h-11 text-xs transition hover:brightness-125"
        style={{
          backgroundColor: 'rgba(196,163,90,0.12)',
          border: '1px solid rgba(196,163,90,0.3)',
          color: '#e8e0d0',
        }}
      >
        <Share2 className="size-3" aria-hidden />
        {t('publish-open', {
          defaultValue: 'Publish to gallery',
        })}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('publish-title', {
                defaultValue: 'Publish this story seed',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('publish-help', {
                defaultValue: 'Give it a title. Anyone can then continue this world with their own cast.',
              })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('publish-field', {
              defaultValue: 'Title',
            })}
            placeholder={t('publish-placeholder', {
              defaultValue: 'A title for your story',
            })}
          />
          <Button variant="default" loading={busy} disabled={title.trim().length < 3} onClick={() => void publish()}>
            {t('publish-submit', {
              defaultValue: 'Publish',
            })}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
