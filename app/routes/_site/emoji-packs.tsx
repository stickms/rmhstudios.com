/**
 * /emoji-packs — browse packs, install them, and manage your own.
 *
 * The membership shape is the whole point of this page and is visible in its
 * layout: **anyone** can browse and install, and the "Your packs" half only
 * appears with a membership — with an upsell in its place when it doesn't. A
 * free account can use every pack on the site; making them is what costs.
 */

import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Check, Loader2, Upload, Sparkles } from 'lucide-react';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { PackSummary, InstalledPack } from '@/lib/emoji/packs';
import { MAX_ITEMS_PER_PACK, SHORTCODE_RE } from '@/lib/emoji/packs';
import { upgradeHref } from '@/lib/entitlements/features';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_site/emoji-packs')({
  head: () => ({
    meta: buildMeta({
      title: 'Emoji & sticker packs',
      description:
        'Browse emoji and sticker packs made by the community, install the ones you like, and build your own.',
      path: '/emoji-packs',
    }),
    links: [buildCanonical('/emoji-packs')],
  }),
  component: EmojiPacksPage,
});

function PackCard({
  pack,
  onToggle,
  busy,
}: {
  pack: PackSummary;
  onToggle: (pack: PackSummary) => void;
  busy: boolean;
}) {
  const { t } = useTranslation('feed');
  return (
    // `.glass-fill` — repeated content. No blur on list items.
    <article className="glass-fill flex flex-col gap-3 rounded-site p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-site-text">{pack.name}</h3>
          <p className="truncate text-xs text-site-text-muted">
            {t('pack-by', { defaultValue: 'by {{name}}', name: pack.owner.name ?? 'someone' })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={pack.subscribed ? 'outline' : 'accent'}
          loading={busy}
          onClick={() => onToggle(pack)}
          className="shrink-0"
        >
          {pack.subscribed ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              {t('pack-installed', { defaultValue: 'Installed' })}
            </>
          ) : (
            t('pack-install', { defaultValue: 'Install' })
          )}
        </Button>
      </div>

      {pack.description && (
        <p className="line-clamp-2 text-sm text-site-text-muted">{pack.description}</p>
      )}

      <p className="text-xs text-site-text-dim">
        {t('pack-counts', {
          defaultValue: '{{items}} items · {{subs}} installs',
          items: pack.itemCount,
          subs: pack.subscriberCount,
        })}
      </p>
    </article>
  );
}

function EmojiPacksPage() {
  const { t } = useTranslation('feed');
  const [browse, setBrowse] = useState<PackSummary[]>([]);
  const [owned, setOwned] = useState<PackSummary[]>([]);
  const [installed, setInstalled] = useState<InstalledPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [browseRes, mineRes] = await Promise.all([
      fetch('/api/emoji-packs').then((r) => (r.ok ? r.json() : { packs: [] })),
      fetch('/api/emoji-packs/installed').then((r) => (r.ok ? r.json() : null)),
    ]);
    setBrowse(browseRes.packs ?? []);
    if (mineRes) {
      setOwned(mineRes.owned ?? []);
      setInstalled(mineRes.installed ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleInstall = useCallback(
    async (pack: PackSummary) => {
      setBusySlug(pack.slug);
      try {
        const res = await fetch(`/api/emoji-packs/${pack.slug}/subscribe`, {
          method: pack.subscribed ? 'DELETE' : 'POST',
        });
        if (!res.ok) throw new Error(String(res.status));
        setBrowse((prev) =>
          prev.map((p) => (p.id === pack.id ? { ...p, subscribed: !p.subscribed } : p)),
        );
        toast.success(
          pack.subscribed
            ? t('pack-removed', { defaultValue: 'Pack removed' })
            : t('pack-added', { defaultValue: 'Pack installed' }),
        );
      } catch {
        toast.error(t('pack-toggle-failed', { defaultValue: 'Could not update that pack.' }));
      } finally {
        setBusySlug(null);
      }
    },
    [t],
  );

  const createPack = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/emoji-packs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      // 402 is the membership refusal; it carries an upgrade envelope.
      if (res.status === 402) {
        setCanCreate(false);
        toast.error(
          t('pack-needs-membership', {
            defaultValue: 'Building packs needs a membership.',
          }),
        );
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setNewName('');
      setCanCreate(true);
      await load();
      toast.success(t('pack-created', { defaultValue: 'Pack created — add some items' }));
    } catch {
      toast.error(t('pack-create-failed', { defaultValue: 'Could not create that pack.' }));
    } finally {
      setCreating(false);
    }
  }, [newName, load, t]);

  return (
    <PageLayout title={t('emoji-packs-title', { defaultValue: 'Emoji & sticker packs' })}>
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-16">
        <p className="text-sm text-site-text-muted">
          {t('emoji-packs-intro', {
            defaultValue:
              'Install a pack and its emoji work everywhere — posts, comments, messages and reactions. Installing is free for everyone; building a pack needs a membership.',
          })}
        </p>

        {/* ── Your packs ───────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-site-text">
            {t('your-packs', { defaultValue: 'Your packs' })}
          </h2>

          {/* `.glass-pane` — a singular panel, not a repeated card. */}
          <div className="glass-pane mt-3 flex flex-col gap-3 rounded-site p-4 sm:flex-row sm:items-center">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createPack();
              }}
              maxLength={60}
              placeholder={t('pack-name-placeholder', { defaultValue: 'New pack name' })}
              aria-label={t('pack-name-placeholder', { defaultValue: 'New pack name' })}
              className="glass-inset h-11 min-w-0 flex-1 rounded-site-sm px-3 text-sm text-site-text outline-none placeholder:text-site-text-dim"
            />
            <Button
              type="button"
              variant="accent"
              loading={creating}
              disabled={!newName.trim()}
              onClick={() => void createPack()}
              className="h-11 shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('pack-create', { defaultValue: 'Create pack' })}
            </Button>
          </div>

          {canCreate === false && (
            <a
              href={upgradeHref('sticker-packs')}
              className="glass-fill mt-3 flex items-center gap-3 rounded-site p-4 text-sm text-site-text"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
              <span>
                {t('pack-upsell', {
                  defaultValue:
                    'Building packs is a membership feature — see what else a membership unlocks.',
                })}
              </span>
            </a>
          )}

          {owned.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {owned.map((pack) => (
                <OwnedPackCard key={pack.id} pack={pack} onChanged={load} />
              ))}
            </div>
          )}
        </section>

        {/* ── Browse ───────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-site-text">
            {t('browse-packs', { defaultValue: 'Browse packs' })}
          </h2>

          {loading ? (
            <div className="mt-4 flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-site-text-dim" aria-hidden />
            </div>
          ) : browse.length === 0 ? (
            <EmptyState
              className="mt-4"
              title={t('no-packs-title', { defaultValue: 'No packs yet' })}
              description={t('no-packs-hint', {
                defaultValue: 'Be the first to publish one — members can build packs above.',
              })}
            />
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {browse.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={{
                    ...pack,
                    subscribed: pack.subscribed ?? installed.some((i) => i.id === pack.id),
                  }}
                  onToggle={toggleInstall}
                  busy={busySlug === pack.slug}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

/** An owned pack, with its item editor inline. */
function OwnedPackCard({ pack, onChanged }: { pack: PackSummary; onChanged: () => void }) {
  const { t } = useTranslation('feed');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const addItem = useCallback(
    async (file: File) => {
      const code = name.trim().toLowerCase();
      if (!SHORTCODE_RE.test(code)) {
        toast.error(
          t('pack-bad-shortcode', {
            defaultValue: 'Shortcodes are 2–32 characters: letters, numbers, _ + and -',
          }),
        );
        return;
      }
      setBusy(true);
      try {
        const form = new FormData();
        form.append('image', file);
        form.append('kind', pack.kind === 'sticker' ? 'sticker' : 'emoji');
        const up = await fetch(`/api/emoji-packs/${pack.slug}/upload`, {
          method: 'POST',
          body: form,
        });
        if (up.status === 402) {
          toast.error(
            t('pack-needs-membership', { defaultValue: 'Building packs needs a membership.' }),
          );
          return;
        }
        if (!up.ok) throw new Error(String(up.status));
        const { mediaId } = (await up.json()) as { mediaId: string };

        const res = await fetch(`/api/emoji-packs/${pack.slug}/items`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: code,
            mediaId,
            // Alt text is mandatory at every tier. Seeded from the shortcode so
            // the field is never empty, and editable afterwards.
            alt: code.replace(/[-_+]/g, ' '),
            kind: pack.kind === 'sticker' ? 'sticker' : 'emoji',
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? String(res.status));
        }
        setName('');
        onChanged();
        toast.success(t('pack-item-added', { defaultValue: 'Added' }));
      } catch (err) {
        toast.error(
          err instanceof Error && err.message.length < 120
            ? err.message
            : t('pack-item-failed', { defaultValue: 'Could not add that item.' }),
        );
      } finally {
        setBusy(false);
      }
    },
    [name, pack.slug, pack.kind, onChanged, t],
  );

  const full = pack.itemCount >= MAX_ITEMS_PER_PACK;

  return (
    <article className="glass-fill flex flex-col gap-3 rounded-site p-4">
      <div>
        <h3 className="truncate text-base font-semibold text-site-text">{pack.name}</h3>
        <p className="text-xs text-site-text-muted">
          {t('pack-item-count', {
            defaultValue: '{{count}} / {{max}} items',
            count: pack.itemCount,
            max: MAX_ITEMS_PER_PACK,
          })}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder={t('pack-shortcode-placeholder', { defaultValue: 'shortcode' })}
          aria-label={t('pack-shortcode-placeholder', { defaultValue: 'shortcode' })}
          className="glass-inset h-11 min-w-0 flex-1 rounded-site-sm px-3 text-sm text-site-text outline-none placeholder:text-site-text-dim"
        />
        <label
          className={cn(
            'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-site-sm border border-site-border px-3 text-sm font-medium text-site-text transition-colors hover:bg-site-surface-hover',
            (busy || full) && 'pointer-events-none opacity-50',
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {t('pack-add-item', { defaultValue: 'Add image' })}
          <input
            type="file"
            accept="image/png,image/webp,image/gif,image/jpeg"
            className="sr-only"
            disabled={busy || full}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void addItem(file);
            }}
          />
        </label>
      </div>

      <p className="text-xs text-site-text-dim">
        {t('pack-pending-note', {
          defaultValue: 'New and edited packs are reviewed before other people can install them.',
        })}
      </p>
    </article>
  );
}
