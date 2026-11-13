/**
 * SpacesColumn — the "Live Spaces" directory, extracted from the old
 * `/spaces` index route so it can be embedded as a tab inside `/communities`.
 * The former route SSR'd the live list via a loader; here the column fetches it
 * CLIENT-SIDE on mount (through the public, cached `/api/spaces/live` endpoint —
 * the same data the route's `listLiveSpaces` server fn returned) so the host
 * page's loader stays scoped to the communities directory.
 *
 * NOTE: this is only the directory. The live room lives at `/spaces/$id` and is
 * untouched — the "start a Space" composer still navigates there on create.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Radio, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DIRECTORY_LIST_CLASS,
  DirectoryFact,
  DirectoryItem,
  DirectoryTag,
} from '@/components/ui/directory-item';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createSpaceApi, listLiveSpacesApi } from '@/lib/spaces/spaces.contract';
import type { LiveSpaceSummary } from '@/lib/spaces/types';

export function SpacesColumn() {
  const { t, i18n } = useTranslation('site');
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<LiveSpaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // No route loader seeds this column anymore — pull the "Live now" list on mount.
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(listLiveSpacesApi)
      .then((d) => {
        if (active) setSpaces(d.spaces ?? []);
      })
      .catch(() => {
        /* leave the list empty on failure */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const data = await api(createSpaceApi, { body: { title: trimmed } });
      navigate({ to: '/spaces/$id', params: { id: data.space.id } });
    } catch (e) {
      toast.error(
        serverError(e) ?? t('space-create-failed', { defaultValue: 'Could not start the Space.' }),
      );
    } finally {
      setCreating(false);
    }
  };

  const hostName = (s: LiveSpaceSummary) =>
    s.host.name ?? s.host.handle ?? t('space-fallback-host', { defaultValue: 'Space' });

  // Laid out like the Communities tab beside it: a line of controls on the list's gutter, then the list.
  // The intro and the form used to sit in their own padded block, 20px inside the heading and the items
  // below them, so nothing on the panel shared an edge.
  return (
    <div>
      <div className="space-y-3 px-4 pb-3">
        <p className="text-sm text-site-text-muted">
          {t('spaces-subtitle', {
            defaultValue: 'Live rooms to chat, listen together, and hang out in real time.',
          })}
        </p>

        {session ? (
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
              maxLength={120}
              aria-label={t('spaces-create-placeholder', {
                defaultValue: 'Give your Space a title…',
              })}
              placeholder={t('spaces-create-placeholder', {
                defaultValue: 'Give your Space a title…',
              })}
              className="min-w-0 flex-1"
            />
            <Button
              variant="default"
              className="h-10"
              onClick={() => void create()}
              loading={creating}
              disabled={!title.trim()}
            >
              <Plus aria-hidden />
              {t('spaces-create-cta', { defaultValue: 'Start' })}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('spaces-signin', { defaultValue: 'Sign in to start a Space.' })}
          </p>
        )}
      </div>

      <section aria-labelledby="spaces-live-heading">
        <div className="px-4 pt-3 pb-2">
          <h2 id="spaces-live-heading" className="site-section-label flex items-center gap-2">
            <span className="size-2 rounded-full bg-site-danger" aria-hidden />
            {t('live-now', { defaultValue: 'Live now' })}
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : spaces.length === 0 ? (
          <EmptyState
            icon={Radio}
            description={t('spaces-none-live', {
              defaultValue: 'No live Spaces right now. Start one above.',
            })}
          />
        ) : (
          <ul className={DIRECTORY_LIST_CLASS}>
            {spaces.map((s: LiveSpaceSummary) => (
              <li key={s.id}>
                <DirectoryItem
                  to={`/spaces/${s.id}`}
                  media={
                    <UserAvatar src={s.host.image} alt="" size={56} fallbackName={hostName(s)} />
                  }
                  title={s.title}
                  tag={<DirectoryTag>{t('space-live-tag', { defaultValue: 'Live' })}</DirectoryTag>}
                  description={
                    s.community
                      ? t('space-hosted-by-in', {
                          defaultValue: 'Hosted by {{host}} in {{community}}',
                          host: hostName(s),
                          community: s.community.name,
                        })
                      : t('space-hosted-by', {
                          defaultValue: 'Hosted by {{host}}',
                          host: hostName(s),
                        })
                  }
                  meta={
                    <>
                      {s.audienceCount != null && (
                        <DirectoryFact>
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {t('space-listening', {
                            count: s.audienceCount,
                            defaultValue: '{{count}} listening',
                          })}
                        </DirectoryFact>
                      )}
                      {s.startedAt && (
                        <DirectoryFact>
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {t('space-started', {
                            defaultValue: 'Started {{when}}',
                            when: formatRelativeTime(s.startedAt, i18n.language),
                          })}
                        </DirectoryFact>
                      )}
                    </>
                  }
                  action={t('space-join', { defaultValue: 'Join' })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
