/**
 * "Pin to community", "Unpin from community", "Move up" and "Move down" in a community post's overflow menu (s09-06),
 * for moderators only. The menu asks where the pins stand when it opens; a person who may not pin sees nothing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pin, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { api, apiQuery } from '@/lib/contract/client';
import {
  getCommunityPinsApi,
  pinCommunityPostApi,
  reorderCommunityPinsApi,
  unpinCommunityPostApi,
} from '@/lib/communities/pins.contract';
import { movePinned, pinMoves, type PinDirection } from '@/lib/communities/pins';
import type { FeedItem } from '@/lib/feed-types';
import { HttpError, errorField, serverError } from '@/lib/http';
import { toast } from '@/lib/toast';

interface Props {
  item: FeedItem;
  /** The menu is open: nothing is asked of the server until someone looks at it. */
  enabled: boolean;
  onDone: () => void;
}

export function CommunityPinMenuItems({ item, enabled, onDone }: Props) {
  const slug = item.communitySlug;
  const postId = item.actualId ?? item.id;
  // Only a top-level post of the community can be pinned (a repost wrapper has an `actualId`).
  const eligible = !!slug && !item.actualId;
  const { t } = useTranslation('community-pins');
  const queryClient = useQueryClient();
  const { data } = useQuery({
    ...apiQuery(getCommunityPinsApi, { params: { slug: slug ?? '' } }),
    enabled: enabled && eligible,
    staleTime: 15_000,
    retry: false,
  });

  const changed = () => queryClient.invalidateQueries({ queryKey: [getCommunityPinsApi.path] });
  const fail = (e: unknown, fallback: string) => {
    if (e instanceof HttpError && e.status === 409 && errorField<string>(e, 'code') === 'pin_limit') {
      toast.error(
        t('limit-reached', {
          defaultValue: 'A community can pin three posts. Unpin one first.',
        }),
      );
      return;
    }
    toast.error(serverError(e) || fallback);
  };

  const pin = useMutation({
    mutationFn: () => api(pinCommunityPostApi, { params: { slug: slug ?? '' }, body: { postId } }),
    onSuccess: () => {
      toast.success(t('pinned', { defaultValue: 'Post pinned' }));
      void changed();
    },
    onError: (e) => fail(e, t('pin-error', { defaultValue: 'Could not pin the post' })),
  });
  const unpin = useMutation({
    mutationFn: () => api(unpinCommunityPostApi, { params: { slug: slug ?? '', postId } }),
    onSuccess: () => {
      toast.success(t('unpinned', { defaultValue: 'Post unpinned' }));
      void changed();
    },
    onError: (e) => fail(e, t('unpin-error', { defaultValue: 'Could not unpin the post' })),
  });
  const move = useMutation({
    mutationFn: (postIds: string[]) =>
      api(reorderCommunityPinsApi, { params: { slug: slug ?? '' }, body: { postIds } }),
    onSuccess: () => {
      toast.success(t('moved', { defaultValue: 'Pinned posts reordered' }));
      void changed();
    },
    onError: (e) => fail(e, t('move-error', { defaultValue: 'Could not move the pin' })),
  });

  if (!eligible || !data?.canModerate) return null;
  const order = data.order;
  const pinned = order.includes(postId);
  const moves = pinMoves(order, postId);
  const reorder = (dir: PinDirection) => {
    onDone();
    const next = movePinned(order, postId, dir);
    if (next) move.mutate(next);
  };

  return (
    <>
      <MenuSeparator />
      {pinned ? (
        <MenuItem
          icon={PinOff}
          onSelect={() => {
            onDone();
            unpin.mutate();
          }}
        >
          {t('unpin', { defaultValue: 'Unpin from community' })}
        </MenuItem>
      ) : (
        <MenuItem
          icon={Pin}
          onSelect={() => {
            onDone();
            pin.mutate();
          }}
        >
          {t('pin', { defaultValue: 'Pin to community' })}
        </MenuItem>
      )}
      {pinned && moves.up ? (
        <MenuItem icon={ArrowUp} onSelect={() => reorder('up')}>
          {t('move-up', { defaultValue: 'Move up' })}
        </MenuItem>
      ) : null}
      {pinned && moves.down ? (
        <MenuItem icon={ArrowDown} onSelect={() => reorder('down')}>
          {t('move-down', { defaultValue: 'Move down' })}
        </MenuItem>
      ) : null}
    </>
  );
}
