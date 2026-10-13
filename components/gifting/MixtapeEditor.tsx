'use client';

/** Curate up to 10 tracks for a mixtape exchange (F2), using the RMHMusic Spotify search. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/components/economy-plus/api';
import { MIXTAPE_MAX_TRACKS, type MixtapeTrack } from '@/lib/gifting/exchange';

interface SearchHit {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  previewUrl: string | null;
}

export default function MixtapeEditor({
  exchangeId,
  initial,
}: {
  exchangeId: string;
  initial: MixtapeTrack[];
}) {
  const { t } = useTranslation('f-gifting');
  const [tracks, setTracks] = useState<MixtapeTrack[]>(initial);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    const res = await fetch(`/api/rmhmusic/spotify/search?q=${encodeURIComponent(q.trim())}`).catch(
      () => null,
    );
    const data = res?.ok
      ? ((await res.json()) as { tracks?: SearchHit[]; configured?: boolean })
      : null;
    setSearching(false);
    if (!data || data.configured === false) {
      toast.error(
        t('mixtape-search-off', { defaultValue: 'Track search is not available right now' }),
      );
      return;
    }
    setHits(data.tracks ?? []);
  }

  function add(h: SearchHit) {
    if (tracks.length >= MIXTAPE_MAX_TRACKS || tracks.some((x) => x.id === h.id)) return;
    setTracks([
      ...tracks,
      {
        id: h.id,
        title: h.title,
        artist: h.artist,
        albumArt: h.albumArt,
        previewUrl: h.previewUrl,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      await apiJson(`/api/gift-exchanges/${exchangeId}/me`, { method: 'PUT', body: { tracks } });
      toast.success(t('mixtape-saved', { defaultValue: 'Mixtape saved' }));
    } catch {
      toast.error(t('mixtape-save-error', { defaultValue: "Couldn't save your mixtape" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="mx-h" className="glass-pane space-y-3 p-4">
      <h2 id="mx-h" className="site-section-label">
        {t('mixtape-title', {
          defaultValue: 'Your mixtape ({{count}}/{{max}})',
          count: tracks.length,
          max: MIXTAPE_MAX_TRACKS,
        })}
      </h2>
      <ol className="space-y-1">
        {tracks.map((tr) => (
          <li
            key={tr.id}
            className="glass-inset flex items-center justify-between gap-2 rounded-site-sm px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate">
              {tr.title} <span className="text-site-text-muted">· {tr.artist}</span>
            </span>
            <IconButton
              icon={X}
              variant="ghost"
              size="icon-sm"
              label={t('mixtape-remove', { defaultValue: 'Remove track' })}
              onClick={() => setTracks(tracks.filter((x) => x.id !== tr.id))}
            />
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('mixtape-search', { defaultValue: 'Search for a song to add' })}
          aria-label={t('mixtape-search', { defaultValue: 'Search for a song to add' })}
        />
        <Button type="submit" variant="ghost" size="sm" loading={searching}>
          <Search />
          {t('mixtape-search-go', { defaultValue: 'Search' })}
        </Button>
      </form>
      {hits.length > 0 ? (
        <ul className="space-y-1">
          {hits.slice(0, 8).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {h.title} <span className="text-site-text-muted">· {h.artist}</span>
              </span>
              <IconButton
                icon={Plus}
                variant="ghost"
                size="icon-sm"
                label={t('mixtape-add', { defaultValue: 'Add to mixtape' })}
                disabled={tracks.length >= MIXTAPE_MAX_TRACKS || tracks.some((x) => x.id === h.id)}
                onClick={() => add(h)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-site-text-muted">
          {t('mixtape-note', {
            defaultValue: 'You need at least one track to be drawn. Edits close at the draw.',
          })}
        </p>
        <Button variant="accent" size="sm" loading={saving} onClick={save}>
          {t('mixtape-save', { defaultValue: 'Save mixtape' })}
        </Button>
      </div>
    </section>
  );
}
