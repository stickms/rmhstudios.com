'use client';

/**
 * L7 — a member's want-to-read / reading / read shelves, each public or private
 * (private by default). Moving a book to Read stamps its finish date, which is
 * what the L3 challenge counts.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BookMarked, Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Switch } from '@/components/ui/switch';
import { useShelfLabels } from './useShelfLabels';
import { useMyShelves, useShelfMutations } from '@/lib/reading/client';
import {
  SHELVES,
  shelfSchema,
  type ShelfEntryView,
  type ShelfId,
  type ShelfPrefs,
} from '@/lib/reading/schema';

const PREF_KEY: Record<ShelfId, keyof ShelfPrefs> = {
  want: 'wantPublic',
  reading: 'readingPublic',
  read: 'readPublic',
};

export default function ShelvesPanel() {
  const { t } = useTranslation('f-reading');
  const { data: session } = useSession();
  const labels = useShelfLabels();
  const { data, isPending } = useMyShelves(!!session);
  const { set, remove, prefs } = useShelfMutations();

  if (!session) {
    return (
      <SignedOutPrompt
        icon={BookMarked}
        title={t('shelves-signed-out', { defaultValue: 'Sign in to keep shelves' })}
        callbackURL="/reading?tab=shelves"
      />
    );
  }
  if (isPending) return <Skeleton className="h-40 w-full" />;
  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        title={t('shelves-empty', { defaultValue: 'Your shelves are empty' })}
        description={t('shelves-empty-hint', {
          defaultValue: 'Open a book in the library and use its Shelf menu to add it here.',
        })}
        action={
          <Link to="/library">
            <Button variant="accent" size="sm">
              {t('open-library', { defaultValue: 'Open the library' })}
            </Button>
          </Link>
        }
      />
    );
  }

  async function move(e: ShelfEntryView, shelf: ShelfId) {
    try {
      await set.mutateAsync({ slug: e.slug, title: e.title, shelf, pages: e.pages });
    } catch {
      toast.error(t('shelf-failed', { defaultValue: 'Could not update the shelf.' }));
    }
  }

  return (
    <div className="space-y-6">
      {SHELVES.map((shelf) => {
        const items = entries.filter((e) => e.shelf === shelf);
        const isPublic = data?.prefs[PREF_KEY[shelf]] ?? false;
        const switchId = `rf-shelf-pub-${shelf}`;
        return (
          <section
            key={shelf}
            className="glass-fill rounded-site p-4"
            aria-labelledby={`rf-shelf-${shelf}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id={`rf-shelf-${shelf}`}
                className="font-display text-lg font-semibold text-site-text"
              >
                {labels[shelf]} <span className="text-site-text-dim">({items.length})</span>
              </h2>
              <label
                htmlFor={switchId}
                className="flex items-center gap-2 text-sm text-site-text-muted"
              >
                {isPublic ? (
                  <Globe className="size-4" aria-hidden />
                ) : (
                  <Lock className="size-4" aria-hidden />
                )}
                {isPublic
                  ? t('shelf-public', { defaultValue: 'Public on your profile' })
                  : t('shelf-private', { defaultValue: 'Private' })}
                <Switch
                  id={switchId}
                  checked={isPublic}
                  onCheckedChange={(v) => prefs.mutate({ [PREF_KEY[shelf]]: v })}
                  aria-label={t('shelf-public-toggle', {
                    shelf: labels[shelf],
                    defaultValue: 'Show the {{shelf}} shelf on your profile',
                  })}
                />
              </label>
            </div>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-site-text-muted">
                {t('shelf-none', { defaultValue: 'Nothing here yet.' })}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-site-border">
                {items.map((e) => (
                  <li key={e.slug} className="flex flex-wrap items-center gap-3 py-2">
                    <Link
                      to="/library/$slug"
                      params={{ slug: e.slug }}
                      className="min-w-0 flex-1 truncate font-medium text-site-text hover:underline"
                    >
                      {e.title}
                    </Link>
                    {e.finishedAt ? (
                      <time dateTime={e.finishedAt} className="text-sm text-site-text-dim">
                        {new Date(e.finishedAt).toLocaleDateString()}
                      </time>
                    ) : null}
                    <Select
                      controlSize="sm"
                      className="w-40"
                      aria-label={t('move-shelf', {
                        title: e.title,
                        defaultValue: 'Move {{title}} to another shelf',
                      })}
                      value={e.shelf}
                      onChange={(ev) => {
                        const parsed = shelfSchema.safeParse(ev.target.value);
                        if (parsed.success) void move(e, parsed.data);
                      }}
                    >
                      {SHELVES.map((s) => (
                        <option key={s} value={s}>
                          {labels[s]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => remove.mutate(e.slug)}
                    >
                      {t('remove-from-shelf', { defaultValue: 'Remove' })}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
