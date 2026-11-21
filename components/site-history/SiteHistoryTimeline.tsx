/**
 * The /site-history timeline: the entries from ./entries.ts, grouped by month on the spine (Steel section 7).
 *
 * Each entry with a picture has a Desktop / Phone switch (one <Tabs>, K5). Two buttons swap the picture for a frame:
 *
 *  - "Open this version" plays the old build itself, recorded by .github/workflows/site-archive.yml
 *    (scripts/site-archive/) for every id in ./archive-versions.json and replayed by ReplayWeb.page. The player and
 *    the recordings are on the CDN origin (cdn.rmhstudios.com/site-archive/), never on this one, so the old code
 *    cannot read this site's cookies or call its API with the visitor's session.
 *  - "Open today's page" loads the page as it is now, same-origin (frame-ancestors 'self' allows it).
 *
 * Nothing loads a frame until it is asked for, one frame per entry, and closing it removes it, so the page holds no
 * live frames at rest (R5, B3). In Phone view the frame is 390px wide, so the page inside lays itself out as it does
 * on a phone.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, History, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spine, SpineItem, SpineStation } from '@/components/ui/spine';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { CDN_BASE } from '@/lib/storage/asset';
import { cn } from '@/lib/utils';
import archive from './archive-versions.json';
import { historyEntries, REPO_URL, type HistoryEntry, type HistoryKind } from './entries';

type Filter = 'all' | HistoryKind;
type View = 'desktop' | 'mobile' | 'open';
type Size = 'desktop' | 'mobile';
type Frame = 'archive' | 'live' | null;

const IMG = '/images/site-history';
// The size each picture is shown at, at most (the column, and the phone frame), in the pictures' own ratio (16:10,
// 390:844), so the box is reserved before the file arrives. A plain lazy <img>, not OptimizedImage: these files are
// excluded from the variant manifest (scripts/gen-image-variants.ts says why), and average 32 KB.
const SIZE: Record<
  Size,
  {
    width: number;
    height: number;
  }
> = {
  desktop: {
    width: 640,
    height: 400,
  },
  mobile: {
    width: 260,
    height: 563,
  },
};

/**
 * The CDN origin the archive player is published to: the media bucket's public origin (CDN_BASE), or production's
 * when a local build has none, since the recordings only exist there.
 */
const ARCHIVE_ORIGIN = CDN_BASE || 'https://cdn.rmhstudios.com';

interface ArchiveVersion {
  id: string;
  commit: string;
  path: string;
}
const ARCHIVED = new Map<string, ArchiveVersion>((archive.versions as ArchiveVersion[]).map((v) => [v.id, v]));

function archiveSrc(v: ArchiveVersion): string {
  return `${ARCHIVE_ORIGIN}/site-archive/play.html?v=${encodeURIComponent(v.id)}&path=${encodeURIComponent(v.path)}`;
}

function monthsBetween(a: string, b: string): number {
  const [ay = 0, am = 0] = a.split('-').map(Number);
  const [by = 0, bm = 0] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function SiteHistoryTimeline() {
  const { t, i18n } = useTranslation('site-history');
  const [filter, setFilter] = useState<Filter>('all');
  const entries = useMemo(() => historyEntries(t), [t]);

  const kindLabel: Record<HistoryKind, string> = {
    home: t('kind.home', {
      defaultValue: 'Homepage and feed',
    }),
    game: t('kind.game', {
      defaultValue: 'Game',
    }),
    app: t('kind.app', {
      defaultValue: 'App',
    }),
    platform: t('kind.platform', {
      defaultValue: 'Platform',
    }),
  };

  const count = (k: HistoryKind) => entries.filter((e) => e.kind === k).length;
  const tabs: TabItem[] = [
    {
      id: 'all',
      label: t('filter.all', {
        defaultValue: 'All',
      }),
      count: entries.length,
    },
    {
      id: 'home',
      label: t('filter.home', {
        defaultValue: 'Homepage',
      }),
      count: count('home'),
    },
    {
      id: 'game',
      label: t('filter.game', {
        defaultValue: 'Games',
      }),
      count: count('game'),
    },
    {
      id: 'app',
      label: t('filter.app', {
        defaultValue: 'Apps',
      }),
      count: count('app'),
    },
    {
      id: 'platform',
      label: t('filter.platform', {
        defaultValue: 'Platform',
      }),
      count: count('platform'),
    },
  ];

  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  const months: {
    month: string;
    items: HistoryEntry[];
  }[] = [];
  for (const e of shown) {
    const month = e.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.month === month) last.items.push(e);
    else
      months.push({
        month,
        items: [e],
      });
  }

  const monthFormat = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const dayFormat = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div>
      <Tabs
        tabs={tabs}
        value={filter}
        onChange={(id) => setFilter(id as Filter)}
        idBase="site-history-filter"
        aria-label={t('filter.label', {
          defaultValue: 'Show',
        })}
        className="mb-4"
      />
      <div
        role="tabpanel"
        id={`site-history-filter-panel-${filter}`}
        aria-labelledby={`site-history-filter-tab-${filter}`}
      >
        <Spine>
          {months.map(({ month, items }, i) => {
            const prev = months[i - 1];
            const gap = prev ? monthsBetween(prev.month, month) - 1 : 0;
            return (
              <section key={month} aria-label={monthFormat.format(new Date(`${month}-01T00:00:00Z`))}>
                {gap > 0 && filter === 'all' && (
                  <SpineItem dot={false}>
                    <p className="t-body text-site-text-muted">
                      {t('gap', {
                        defaultValue_one: 'No commits for {{count}} month.',
                        defaultValue_other: 'No commits for {{count}} months.',
                        count: gap,
                      })}
                    </p>
                  </SpineItem>
                )}
                <SpineStation className="pt-6">{monthFormat.format(new Date(`${month}-01T00:00:00Z`))}</SpineStation>
                {items.map((entry) => (
                  <Entry
                    key={entry.id}
                    entry={entry}
                    kind={kindLabel[entry.kind]}
                    date={dayFormat.format(new Date(`${entry.date}T00:00:00Z`))}
                  />
                ))}
              </section>
            );
          })}
        </Spine>
      </div>
    </div>
  );
}

function Entry({ entry, kind, date }: { entry: HistoryEntry; kind: string; date: string }) {
  const { t } = useTranslation('site-history');
  const [view, setView] = useState<View>('desktop');
  const [frame, setFrame] = useState<Frame>(null);
  const headingId = `site-history-${entry.id}`;
  const idBase = `site-history-view-${entry.id}`;
  const archived = ARCHIVED.get(entry.id);
  const hasPreview = Boolean(entry.shot || entry.live || archived);

  const viewTabs: TabItem[] = [
    {
      id: 'desktop',
      label: t('view.desktop', {
        defaultValue: 'Desktop',
      }),
    },
    {
      id: 'mobile',
      label: t('view.mobile', {
        defaultValue: 'Phone',
      }),
    },
  ];
  if (entry.alt && !frame)
    viewTabs.push({
      id: 'open',
      label: t('view.open', {
        defaultValue: 'Navigator open',
      }),
    });

  // The open view shows the desktop picture when there is one, and the phone picture otherwise.
  const size: Size = view === 'desktop' || (view === 'open' && entry.alt === 'both') ? 'desktop' : 'mobile';
  const src = entry.shot ? `${IMG}/${entry.shot}${view === 'open' ? '-alt' : ''}-${size}.webp` : null;
  const viewName =
    {
      desktop: viewTabs[0]?.label,
      mobile: viewTabs[1]?.label,
      open: viewTabs[2]?.label,
    }[view] ?? '';

  const open = (next: Frame) => {
    if (view === 'open') setView('desktop');
    setFrame(next);
  };
  const frameSrc =
    frame === 'archive' && archived ? archiveSrc(archived) : frame === 'live' ? (entry.live ?? null) : null;

  return (
    <SpineItem as="article" aria-labelledby={headingId}>
      <p className="t-meta">
        <time dateTime={entry.date}>{date}</time>
        {' · '}
        {kind}
        {' · '}
        <a href={`${REPO_URL}/commit/${entry.commit}`} target="_blank" rel="noopener noreferrer" className="underline">
          {entry.commit}
        </a>
        {entry.pr ? (
          <>
            {' · '}
            <a href={`${REPO_URL}/pull/${entry.pr}`} target="_blank" rel="noopener noreferrer" className="underline">
              #{entry.pr}
            </a>
          </>
        ) : null}
      </p>
      <h3 id={headingId} className="t-heading mt-1">
        {entry.title}
      </h3>
      <p className="t-post mt-1 text-site-text">{entry.body}</p>

      {hasPreview && (
        <figure className="mt-3">
          <Tabs
            tabs={viewTabs}
            value={view}
            onChange={(id) => setView(id as View)}
            idBase={idBase}
            aria-label={t('view.label', {
              defaultValue: 'View as',
            })}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {frame ? (
              <Button size="sm" onClick={() => setFrame(null)}>
                <X aria-hidden />
                {t('live.close', {
                  defaultValue: 'Close',
                })}
              </Button>
            ) : (
              <>
                {archived && (
                  <Button size="sm" onClick={() => open('archive')}>
                    <History aria-hidden />
                    {t('archive.open', {
                      defaultValue: 'Open this version',
                    })}
                  </Button>
                )}
                {entry.live && (
                  <Button size="sm" onClick={() => open('live')}>
                    <Play aria-hidden />
                    {t('live.openToday', {
                      defaultValue: "Open today's page",
                    })}
                  </Button>
                )}
              </>
            )}
            {frameSrc && (
              <Button size="icon-sm" variant="ghost" asChild>
                <a
                  href={frameSrc}
                  target="_blank"
                  rel="noopener"
                  aria-label={t('live.newTab', {
                    defaultValue: 'Open {{title}} in a new tab',
                    title: entry.title,
                  })}
                >
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </div>

          <div
            role="tabpanel"
            id={`${idBase}-panel-${view}`}
            aria-labelledby={`${idBase}-tab-${view}`}
            className="mt-3"
          >
            {frameSrc ? (
              <iframe
                src={frameSrc}
                title={
                  frame === 'archive'
                    ? t('archive.frameTitle', {
                        defaultValue: '{{title}}, as it was',
                        title: entry.title,
                      })
                    : t('live.frameTitle', {
                        defaultValue: '{{title}}, live',
                        title: entry.title,
                      })
                }
                allow="fullscreen; autoplay; gamepad"
                className={cn(
                  'mx-auto block h-[70svh] max-h-[720px] min-h-[420px] w-full rounded-site border border-site-border bg-site-bg-subtle',
                  size === 'mobile' && 'max-w-[390px]',
                )}
              />
            ) : src ? (
              <a
                href={src}
                target="_blank"
                rel="noopener"
                className={cn('mx-auto block', size === 'mobile' && 'max-w-[260px]')}
              >
                <img
                  key={src}
                  src={src}
                  alt={t('shot.alt', {
                    defaultValue: '{{title}}, {{view}} view',
                    title: entry.title,
                    view: viewName,
                  })}
                  width={SIZE[size].width}
                  height={SIZE[size].height}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-site border border-site-border bg-site-bg-subtle"
                />
              </a>
            ) : (
              <p className="t-body text-site-text-muted">
                {archived
                  ? t('shot.noneArchive', {
                      defaultValue: 'No picture of this one. Open this version to see it.',
                    })
                  : t('shot.none', {
                      defaultValue: 'No picture of this one. Open it to see the page as it is now.',
                    })}
              </p>
            )}
          </div>
          <figcaption className="t-meta mt-2">
            {frame === 'archive' && archived
              ? t('archive.caption', {
                  defaultValue:
                    'A recording of {{commit}}, played back in your browser. Signing in, posting, saving and multiplayer did not exist in the recording, so they do nothing here.',
                  commit: archived.commit,
                })
              : frame === 'live'
                ? t('live.caption', {
                    defaultValue: 'The page as it is today.',
                  })
                : src
                  ? entry.shotIsCurrent
                    ? t('shot.current', {
                        defaultValue: 'The page as it is today.',
                      })
                    : t('shot.atCommit', {
                        defaultValue: 'Built from {{commit}} and photographed signed out.',
                        commit: entry.commit,
                      })
                  : null}
          </figcaption>
        </figure>
      )}
    </SpineItem>
  );
}
