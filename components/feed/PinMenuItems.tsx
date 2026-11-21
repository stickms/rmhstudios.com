import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Pin,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/components/ui/menu';
import { api } from '@/lib/contract/client';
import type { FeedItem } from '@/lib/feed-types';
import {
  HttpError,
  serverError,
} from '@/lib/http';
import {
  PROFILE_PINS_CHANGED,
  moveOptions,
  type PinDirection,
} from '@/lib/feed/profile-pins';
import {
  getPinStateApi,
  movePinApi,
  pinPostApi,
  type PinState,
} from '@/lib/feed/profile-pins.contract';
import { toast } from '@/lib/toast';

const stateKey =
  (
    postId: string,
  ) =>
    [
      'profile-pins',
      postId,
    ] as const;

interface PinMenuItemsProps {
  item: FeedItem;
  /** The menu is open: nothing is asked of the server until the author looks at it. */
  enabled: boolean;
  /** Close the menu. */
  onDone: () => void;
  /** Sync the post's pinned state back to the surface that shows it. */
  onUpdate?: (
    updates: Partial<FeedItem>,
  ) => void;
}

/**
 * "Pin to profile (2 of 3)", "Unpin from profile" and, on a pinned post, "Move up" and "Move down" in the author's
 * post menu (sprint 05 #19). Up to three posts can be pinned, in the order they were pinned; a fourth is refused with
 * the limit named and nothing is unpinned. The menu asks where the post stands when it opens, so the rows can say
 * which place the next pin takes and which moves are possible. After any change an open profile loads its first page
 * again so the pinned posts lead in their new order.
 */
export function PinMenuItems({
  item,
  enabled,
  onDone,
  onUpdate,
}: PinMenuItemsProps) {
  const {
    t,
  } =
    useTranslation(
      'profile-pins',
    );
  const queryClient =
    useQueryClient();
  const postId =
    item.actualId ??
    item.id;
  const {
    data: loaded,
  } =
    useQuery(
      {
        queryKey:
          stateKey(
            postId,
          ),
        enabled,
        staleTime: 0,
        retry: false,
        queryFn:
          () =>
            api(
              getPinStateApi,
              {
                params:
                  {
                    id: postId,
                  },
              },
            ),
      },
    );
  // Until the answer arrives the row follows what the post already says.
  const state:
    | PinState
    | undefined =
    loaded;
  const pinned =
    state
      ? state.pinned
      : !!item.pinned;
  const order =
    state?.pinnedOrder ??
    item.pinnedOrder ??
    null;
  const count =
    state?.pinnedCount ??
    0;
  const limit =
    state?.limit ??
    3;
  const moves =
    state
      ? moveOptions(
          {
            order,
            count,
          },
        )
      : {
          up: false,
          down: false,
        };

  const applied =
    (
      next: PinState,
    ) => {
      queryClient.setQueryData(
        stateKey(
          postId,
        ),
        next,
      );
      onUpdate?.(
        {
          pinned:
            next.pinned,
          pinnedOrder:
            next.pinnedOrder ??
            undefined,
        },
      );
      window.dispatchEvent(
        new Event(
          PROFILE_PINS_CHANGED,
        ),
      );
    };

  const toggle =
    async () => {
      onDone();
      try {
        const next =
          await api(
            pinPostApi,
            {
              params:
                {
                  id: postId,
                },
            },
          );
        applied(
          next,
        );
        toast.success(
          next.pinned
            ? t(
                'pinned',
                {
                  defaultValue:
                    'Pinned to your profile',
                },
              )
            : t(
                'unpinned',
                {
                  defaultValue:
                    'Unpinned from your profile',
                },
              ),
        );
      } catch (e) {
        // The refusal for a fourth pin is the server's 409; the sentence is the translated one.
        if (
          e instanceof
            HttpError &&
          e.status ===
            409
        ) {
          toast.error(
            t(
              'limit-reached',
              {
                max: limit,
                defaultValue:
                  'You can pin up to {{max}} posts. Unpin one first.',
              },
            ),
          );
          return;
        }
        toast.error(
          serverError(
            e,
          ) ||
            t(
              'pin-error',
              {
                defaultValue:
                  'Could not change the pin',
              },
            ),
        );
      }
    };

  const move =
    async (
      direction: PinDirection,
    ) => {
      onDone();
      try {
        const next =
          await api(
            movePinApi,
            {
              params:
                {
                  id: postId,
                },
              body: {
                direction,
              },
            },
          );
        applied(
          next,
        );
        toast.success(
          direction ===
            'up'
            ? t(
                'moved-up',
                {
                  defaultValue:
                    'Moved up',
                },
              )
            : t(
                'moved-down',
                {
                  defaultValue:
                    'Moved down',
                },
              ),
        );
      } catch (e) {
        toast.error(
          serverError(
            e,
          ) ||
            t(
              'move-error',
              {
                defaultValue:
                  'Could not move the pin',
              },
            ),
        );
      }
    };

  return (
    <>
      <MenuItem
        icon={
          Pin
        }
        // The fill IS the state here, so it overrides the row's default dim ink.
        iconClassName={
          pinned
            ? 'fill-site-accent text-site-accent'
            : undefined
        }
        onSelect={() =>
          void toggle()
        }
      >
        {pinned
          ? t(
              'unpin',
              {
                defaultValue:
                  'Unpin from profile',
              },
            )
          : state &&
              count <
                limit
            ? t(
                'pin-slot',
                {
                  position:
                    count +
                    1,
                  max: limit,
                  defaultValue:
                    'Pin to profile ({{position}} of {{max}})',
                },
              )
            : t(
                'pin',
                {
                  defaultValue:
                    'Pin to profile',
                },
              )}
      </MenuItem>
      {pinned &&
      moves.up ? (
        <MenuItem
          icon={
            ArrowUp
          }
          aria-label={t(
            'move-up-label',
            {
              position:
                order,
              total:
                count,
              defaultValue:
                'Move up, pinned {{position}} of {{total}}',
            },
          )}
          onSelect={() =>
            void move(
              'up',
            )
          }
        >
          {t(
            'move-up',
            {
              defaultValue:
                'Move up',
            },
          )}
        </MenuItem>
      ) : null}
      {pinned &&
      moves.down ? (
        <MenuItem
          icon={
            ArrowDown
          }
          aria-label={t(
            'move-down-label',
            {
              position:
                order,
              total:
                count,
              defaultValue:
                'Move down, pinned {{position}} of {{total}}',
            },
          )}
          onSelect={() =>
            void move(
              'down',
            )
          }
        >
          {t(
            'move-down',
            {
              defaultValue:
                'Move down',
            },
          )}
        </MenuItem>
      ) : null}
    </>
  );
}
