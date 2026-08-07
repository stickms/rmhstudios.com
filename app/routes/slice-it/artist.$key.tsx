import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Disc3, Loader2, Music, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper';
import { formatSongDuration, type LibrarySong } from '@/lib/slice-it/library-filters';
import { packLibraryPath, type PackSummary } from '@/lib/slice-it/packs';
import { buildCanonical, buildMeta } from '@/lib/seo';

/**
 * L15 — the artist page.
 *
 * "Everything by this artist" was a substring search over a free-text column:
 * it missed "Artist feat. Someone" and matched "Artist Two". The `$key` param
 * is the normalised `artistKey`, so this is an indexed equality lookup and both
 * of those stop being true.
 *
 * A top-level route rather than one under `_site/`: Slice It is a full-screen
 * game and this page is part of it, in `.slice-theme` with the neumorphic
 * surfaces the rest of the game uses. The public/SEO twin under
 * `_site/games/slice-it/` that `L15` also sketches is a separate page with
 * `--site-*` glass and its own `head()`; it is not built here, and its absence
 * costs nothing that the in-game page provides.
 *
 * Every route into this page carries the key that the library card already
 * holds (`LibrarySong.artistKey`), so nothing has to re-derive it and the
 * client and the server cannot disagree about what a key is.
 */

interface ArtistResponse {
  artist: {
    key: string;
    display: string;
    songCount: number;
    totalPlays: number;
    avgBpm: number | null;
    topRating: number | null;
  };
  songs: LibrarySong[];
  albums: PackSummary[];
  hasMore: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="neumorphic-inset rounded-xl px-4 py-3 min-w-24">
      <div className="text-lg font-black text-slice-text tabular-nums">{value}</div>
      <div className="text-[0.65rem] font-bold uppercase tracking-widest text-slice-text-light">
        {label}
      </div>
    </div>
  );
}

function ArtistPage() {
  const { t } = useTranslation('r-slice-it');
  const { key } = Route.useParams();
  const [data, setData] = useState<ArtistResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void (async () => {
      try {
        const res = await fetch(`/api/slice-it/songs/artist/${encodeURIComponent(key)}`);
        if (cancelled) return;
        if (!res.ok) {
          setState('missing');
          return;
        }
        setData((await res.json()) as ArtistResponse);
        setState('ready');
      } catch {
        if (!cancelled) setState('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <DarkModeWrapper>
      <main className="fixed inset-0 slice-theme overflow-y-auto bg-slice-bg transition-colors duration-300">
        <div className="p-3 flex items-center gap-3 shadow-sm bg-slice-bg border-b border-slice-shadow-dark/30 sticky top-0 z-10">
          <Link to="/slice-it" search={{ q: '', sort: 'recent', view: 'grid' }}>
            <Button
              variant="ghost"
              size="sm"
              className="text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20 rounded-lg text-xs"
            >
              <ArrowLeft className="w-3 h-3 mr-1" aria-hidden />
              <span className="font-bold">
                {t('back-to-library', { defaultValue: 'Back to library' })}
              </span>
            </Button>
          </Link>
        </div>

        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
          {state === 'loading' && (
            <div className="flex items-center justify-center py-24 text-slice-text-light">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
            </div>
          )}

          {state === 'missing' && (
            <div className="neumorphic rounded-2xl p-10 text-center">
              <Music className="w-10 h-10 mx-auto mb-3 text-slice-text-light" aria-hidden />
              <p className="font-bold text-slice-text">
                {t('artist-missing', { defaultValue: 'No tracks by that artist yet.' })}
              </p>
            </div>
          )}

          {state === 'ready' && data && (
            <>
              <header className="neumorphic rounded-2xl p-5 sm:p-6 space-y-4">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slice-text-light">
                    {t('artist-label', { defaultValue: 'Artist' })}
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-black text-slice-text soft-glow-text break-words">
                    {data.artist.display}
                  </h1>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Stat
                    label={t('artist-tracks', { defaultValue: 'Tracks' })}
                    value={String(data.artist.songCount)}
                  />
                  <Stat
                    label={t('artist-plays', { defaultValue: 'Plays' })}
                    value={data.artist.totalPlays.toLocaleString()}
                  />
                  {data.artist.avgBpm !== null && (
                    <Stat
                      label={t('artist-avg-bpm', { defaultValue: 'Avg BPM' })}
                      value={String(Math.round(data.artist.avgBpm))}
                    />
                  )}
                  {data.artist.topRating !== null && (
                    <Stat
                      label={t('artist-top-rating', { defaultValue: 'Hardest' })}
                      value={data.artist.topRating.toFixed(1)}
                    />
                  )}
                </div>

                <Link
                  to="/slice-it"
                  search={{ q: '', sort: 'recent', view: 'grid', artist: data.artist.key }}
                >
                  <Button className="rounded-xl bg-blue-500 text-white hover:bg-blue-600 font-bold">
                    <Play className="w-4 h-4 mr-1.5" aria-hidden />
                    {t('artist-browse', { defaultValue: 'Browse in library' })}
                  </Button>
                </Link>
              </header>

              {data.albums.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slice-text-light">
                    {t('artist-albums', { defaultValue: 'Albums' })}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.albums.map((album) => (
                      <a
                        key={album.id}
                        href={packLibraryPath(album.id)}
                        className="neumorphic rounded-xl p-3 flex items-center gap-3 hover:bg-slice-shadow-dark/10 transition-colors"
                      >
                        <Disc3 className="w-5 h-5 shrink-0 text-slice-text-light" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slice-text">
                            {album.title}
                          </span>
                          <span className="block text-xs text-slice-text-light">
                            {t('pack-track-count', {
                              defaultValue: '{{count}} tracks',
                              count: album.songCount,
                            })}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-slice-text-light">
                  {t('artist-track-list', { defaultValue: 'Tracks' })}
                </h2>
                <ul className="neumorphic rounded-2xl divide-y divide-slice-shadow-dark/30 overflow-hidden">
                  {data.songs.map((song) => (
                    <li key={song.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-slice-text">
                          {song.title}
                        </span>
                        {song.album && (
                          <span className="block truncate text-xs text-slice-text-light">
                            {song.album}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-xs text-slice-text-muted whitespace-nowrap">
                        {formatSongDuration(song.duration)}
                      </span>
                      <span className="tabular-nums text-xs text-slice-text-light whitespace-nowrap w-16 text-right">
                        {t('artist-play-count', {
                          defaultValue: '{{count}} plays',
                          count: song.plays,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.hasMore && (
                  <p className="text-xs text-slice-text-light text-center">
                    {t('artist-more', {
                      defaultValue: 'Showing the most played — open the library for the rest.',
                    })}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </DarkModeWrapper>
  );
}

export const Route = createFileRoute('/slice-it/artist/$key')({
  /**
   * L15 — the artist page's own head.
   *
   * Built from the route param rather than from a loader: the page fetches its
   * songs client-side, and adding a loader purely for a title would put a
   * database round trip on the critical path of a page that already renders
   * without one. The key is the normalised artist string, so it is a
   * serviceable title on its own.
   *
   * `buildCanonical` because this IS a public page — `lib/sitemap.ts` leaves it
   * out of the sitemap (the artist space is unbounded) but it is reachable by
   * crawl from every song card, and a reachable page without a canonical is a
   * duplicate-content report waiting to happen.
   */
  head: ({ params }: { params: { key: string } }) => ({
    meta: buildMeta({
      title: `${params.key} — Slice It! | RMH Studios`,
      description: `Every Slice It! chart by ${params.key}.`,
      path: `/slice-it/artist/${params.key}`,
    }),
    links: [buildCanonical(`/slice-it/artist/${params.key}`)],
  }),
  component: ArtistPage,
});
