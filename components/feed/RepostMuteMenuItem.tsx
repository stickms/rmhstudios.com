import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Repeat2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { MenuItem } from '@/components/ui/menu';
import { api } from '@/lib/contract/client';
import type { FeedItem } from '@/lib/feed-types';
import { listRepostMutesApi, setRepostMuteApi } from '@/lib/feed/repost-mutes.contract';
import { repostMuteTarget, withoutRepostsBy } from '@/lib/feed/repost-mutes';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { useFeedStore } from '@/stores/feedStore';

const offKey = (userId: string) => ['feed', 'repost-mute', userId] as const;

interface RepostMuteMenuItemProps {
  item: FeedItem;
  /** The menu is open: nothing is asked of the server until a member looks at it. */
  enabled: boolean;
  /** Close the menu. */
  onDone: () => void;
}

/**
 * "Turn off reposts from {{name}}" / "Turn on reposts from {{name}}" in the post overflow menu (sprint 05 #07).
 *
 * The person is the reposter on a repost and the author on any other post. Turning reposts off takes every repost by
 * that person out of the feed already on screen (and out of the "new posts" buffer) and offers Undo; the server leaves
 * them out of later pages. Their own posts, quotes and replies are untouched. Renders nothing on the member's own
 * post or when signed out.
 */
export function RepostMuteMenuItem({ item, enabled, onDone }: RepostMuteMenuItemProps) {
  const { t } = useTranslation('repost-mutes');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const target = repostMuteTarget(item, session?.user?.id);
  const targetId = target?.id ?? '';
  const { data: isOff } = useQuery({
    queryKey: offKey(targetId),
    enabled: enabled && !!target,
    staleTime: 30_000,
    retry: false,
    queryFn: async () =>
      (
        await api(listRepostMutesApi, {
          query: {
            target: targetId,
          },
        })
      ).targetOff === true,
  });

  if (!target) return null;
  const name =
    target.name ||
    t('someone', {
      defaultValue: 'this member',
    });

  const set = async (off: boolean) => {
    const data = await api(setRepostMuteApi, {
      body: {
        targetUserId: target.id,
        off,
      },
    });
    queryClient.setQueryData(offKey(target.id), data.off);
    // The settings list shows what was just changed.
    void queryClient.invalidateQueries({
      queryKey: ['feed', 'repost-mutes'],
    });
    return data.off;
  };

  const select = async () => {
    onDone();
    try {
      if (isOff) {
        await set(false);
        toast.success(
          t('turned-on', {
            name,
            defaultValue: 'Reposts from {{name}} are back on',
          }),
        );
        return;
      }
      await set(true);
      useFeedStore.setState((s) => ({
        items: withoutRepostsBy(s.items, target.id),
        pendingItems: withoutRepostsBy(s.pendingItems, target.id),
      }));
      toast.success(
        t('turned-off', {
          name,
          defaultValue: 'Reposts from {{name}} are off',
        }),
        {
          action: {
            label: t('undo', {
              defaultValue: 'Undo',
            }),
            onClick: () => {
              void set(false)
                .then(() => {
                  if (useFeedStore.getState().items.length) void useFeedStore.getState().refresh();
                })
                .catch((e) =>
                  toast.error(
                    serverError(e) ||
                      t('undo-error', {
                        defaultValue: 'Could not undo that',
                      }),
                  ),
                );
            },
          },
        },
      );
    } catch (e) {
      toast.error(
        serverError(e) ||
          t('error', {
            defaultValue: 'Could not change reposts for this member',
          }),
      );
    }
  };

  return (
    <MenuItem icon={Repeat2} onSelect={() => void select()}>
      {isOff
        ? t('turn-on', {
            name,
            defaultValue: 'Turn on reposts from {{name}}',
          })
        : t('turn-off', {
            name,
            defaultValue: 'Turn off reposts from {{name}}',
          })}
    </MenuItem>
  );
}
