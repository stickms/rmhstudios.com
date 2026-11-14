import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '@/components/ui/search-field';
import { Link, useNavigate } from '@tanstack/react-router';
import { Users, Plus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommunityListSkeleton } from '@/components/feed/CommunitiesSkeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useArrival } from '@/components/ui/arrive';
import {
  DIRECTORY_LIST_CLASS,
  DirectoryFact,
  DirectoryItem,
  DirectoryTag,
} from '@/components/ui/directory-item';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';
import { LockedCommunityHeader, RequestToJoin } from '@/components/communities/LockedCommunity';
import { ColumnHeader } from './ColumnHeader';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { createCommunityApi, listCommunitiesApi } from '@/lib/communities/communities.contract';

interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  postCount: number;
  joined: boolean;
  role: string | null;
  /** A private community: members see it as normal, everyone else as a locked card. */
  isPrivate?: boolean;
  locked?: boolean;
  requestState?: 'PENDING' | 'DENIED' | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function CommunitiesColumn({
  initialCommunities = [],
  embedded = false,
}: {
  initialCommunities?: Community[];
  /**
   * When rendered as a tab inside another page (e.g. `/communities`'s tab shell),
   * the parent already owns a sticky bar + the mobile drawer button — so the
   * column's own header drops both to avoid a double sticky row / duplicate menu.
   */
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [items, setItems] = useState<Community[]>(initialCommunities);
  // The route loader already provided the first page, so we start resolved —
  // no spinner, no client-side fetch waterfall on mount.
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Steel M9: a list fetched here replaces the skeleton; the loader's first page is there on first paint.
  const arrival = useArrival(!(loading && items.length === 0));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const trimmed = q?.trim();
      setItems((await api(listCommunitiesApi, { query: { q: trimmed || undefined } })).communities);
    } catch {
      // Keep the list that is shown.
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search. The initial list comes from the route loader, so we skip
  // the first run and only re-fetch when the query actually changes — otherwise
  // the search debounce would pointlessly delay (and re-request) the already-
  // seeded list on mount.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(query), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, load]);

  const create = async () => {
    if (name.trim().length < 2) return;
    setSubmitting(true);
    try {
      const data = await api(createCommunityApi, {
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon || undefined,
        },
      });
      toast.success(t('community-created', { defaultValue: 'Community created!' }));
      setCreateOpen(false);
      navigate({ to: `/c/${data.slug}` as string });
    } catch (err) {
      toast.error(
        serverError(err) || t('community-create-error', { defaultValue: 'Could not create community' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'surface-field w-full rounded-site-sm px-3 py-2 text-sm text-site-text placeholder:text-site-text-muted focus:border-site-accent focus:outline-none';

  return (
    <div>
      {embedded ? (
        // A tab on /communities: the page already has its title and tab strip,
        // so this is just the toolbar — search and the one action on a single
        // row, the same shape the Inbox uses. It used to be a title-less header
        // holding only the button, a hairline, the search, and another
        // hairline: two dividers and a whole row spent on one button.
        <div className="flex items-center gap-2 px-4 pb-3">
          <SearchField
            containerClassName="flex-1"
            value={query}
            onValueChange={setQuery}
            placeholder={t('search-communities', { defaultValue: 'Search communities' })}
            aria-label={t('search-communities', { defaultValue: 'Search communities' })}
          />
          {session && (
            <Button size="sm" variant="default" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t('new-button', { defaultValue: 'New' })}
            </Button>
          )}
        </div>
      ) : (
        <>
          <ColumnHeader
            icon={Users}
            title={t('communities-heading', { defaultValue: 'Communities' })}
            actions={
              session && (
                <Button size="sm" variant="default" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> {t('new-button', { defaultValue: 'New' })}
                </Button>
              )
            }
          />
          <div className="px-4 pb-3">
            <SearchField
              value={query}
              onValueChange={setQuery}
              placeholder={t('search-communities', { defaultValue: 'Search communities' })}
              aria-label={t('search-communities', { defaultValue: 'Search communities' })}
            />
          </div>
        </>
      )}

      {loading && items.length === 0 ? (
        <CommunityListSkeleton />
      ) : items.length === 0 ? (
        /* Icon, title, description and — crucially — the action. The copy said
 "create the first one!" without offering any way to do it; the button
 that does lives in the header, off the top of a scrolled column. */
        <EmptyState
          className={arrival}
          icon={Users}
          title={
            query.trim()
              ? t('no-communities-found', { defaultValue: 'No communities match your search.' })
              : t('no-communities-title', { defaultValue: 'No communities yet' })
          }
          description={
            query.trim()
              ? t('no-communities-found-hint', {
                  defaultValue: 'Try a different name, or start one of your own.',
                })
              : t('no-communities-hint', {
                  defaultValue:
                    'Communities are spaces for a shared interest. Start the first one.',
                })
          }
          action={
            session ? (
              <Button variant="default" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />{' '}
                {t('create-community-title', { defaultValue: 'Create a community' })}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className={cn(DIRECTORY_LIST_CLASS, arrival)}>
          {items.map((c) => {
            if (c.locked) {
              // Listed + locked: metadata and the way in, nothing of the content.
              return (
                <li key={c.id}>
                  <div className="flex flex-col gap-3 rounded-site relative p-5">
                    <Link
                      to={`/c/${c.slug}` as string}
                      className="rounded-site-sm transition-colors duration-site hover:bg-site-surface-hover"
                    >
                      <LockedCommunityHeader community={c} />
                    </Link>
                    <RequestToJoin
                      slug={c.slug}
                      initialState={c.requestState ?? null}
                      className="justify-end"
                    />
                  </div>
                </li>
              );
            }
            const roleLabel =
              c.role === 'ADMIN'
                ? t('role-owner', { defaultValue: 'Owner' })
                : c.role === 'MOD'
                  ? t('role-mod', { defaultValue: 'Mod' })
                  : c.joined
                    ? t('joined-badge', { defaultValue: 'Joined' })
                    : null;
            return (
              <li key={c.id}>
                <DirectoryItem
                  to={`/c/${c.slug}`}
                  media={c.icon || '👥'}
                  mediaStyle={{ background: (c.color || 'var(--site-accent)') + '22' }}
                  title={c.name}
                  tag={roleLabel && <DirectoryTag>{roleLabel}</DirectoryTag>}
                  description={c.description}
                  meta={
                    <>
                      <DirectoryFact>
                        <Users className="h-3.5 w-3.5" />
                        {t('members-stat', {
                          count: c.memberCount,
                          formatted: formatCount(c.memberCount),
                          defaultValue: '{{formatted}} members',
                        })}
                      </DirectoryFact>
                      <DirectoryFact>
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t('posts-stat', {
                          count: c.postCount,
                          formatted: formatCount(c.postCount),
                          defaultValue: '{{formatted}} posts',
                        })}
                      </DirectoryFact>
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('create-community-title', { defaultValue: 'Create a community' })}
            </DialogTitle>
          </DialogHeader>
          <input
            className={inputCls}
            placeholder={t('name-placeholder', { defaultValue: 'Name' })}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={inputCls}
            placeholder={t('description-placeholder', { defaultValue: 'Description (optional)' })}
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder={t('icon-placeholder', { defaultValue: 'Emoji icon (optional, e.g. 🎮)' })}
            value={icon}
            maxLength={8}
            onChange={(e) => setIcon(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>
              {t('cancel-button', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant="default"
              onClick={create}
              disabled={submitting || name.trim().length < 2}
            >
              {submitting
                ? t('creating-button', { defaultValue: 'Creating…' })
                : t('create-button', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
