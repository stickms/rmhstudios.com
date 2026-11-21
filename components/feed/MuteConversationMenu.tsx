import type { RefObject } from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BellOff,
  Bell,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { api } from '@/lib/contract/client';
import {
  clearConversationMuteApi,
  getConversationMuteApi,
  setConversationMuteApi,
  type MuteState,
} from '@/lib/feed/conversation-controls.contract';
import type { MuteChoice } from '@/lib/feed/conversation-controls';
import { toast } from '@/lib/toast';

const muteKey =
  (
    postId: string,
  ) =>
    [
      'feed',
      'conversation-mute',
      postId,
    ] as const;

export interface ConversationMute {
  /** Null until the member's choice for this conversation has loaded. */
  state:
    | MuteState
    | undefined;
  muted: boolean;
  set: (
    choice: MuteChoice,
  ) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * The member's All / Mentions only / None choice for a post's conversation. `enabled` is the menu being open: nothing is
 * fetched until a member looks at the menu.
 */
export function useConversationMute(
  postId: string,
  enabled: boolean,
): ConversationMute {
  const {
    t,
  } =
    useTranslation(
      'conversation-controls',
    );
  const queryClient =
    useQueryClient();
  const {
    data,
  } =
    useQuery(
      {
        queryKey:
          muteKey(
            postId,
          ),
        queryFn:
          () =>
            api(
              getConversationMuteApi,
              {
                params:
                  {
                    id: postId,
                  },
              },
            ),
        enabled,
        staleTime: 30_000,
        retry: false,
      },
    );
  const store =
    (
      next: MuteState,
    ) => {
      queryClient.setQueryData(
        muteKey(
          postId,
        ),
        next,
      );
      // The Muted conversations list in settings reads the same choice.
      void queryClient.invalidateQueries(
        {
          queryKey:
            [
              'settings',
              'muted-conversations',
            ],
        },
      );
    };
  return {
    state:
      data,
    muted:
      !!data &&
      data.mode !==
        'all',
    set: async (
      choice,
    ) => {
      try {
        const next =
          await api(
            setConversationMuteApi,
            {
              params:
                {
                  id: postId,
                },
              body: {
                choice,
              },
            },
          );
        store(
          next,
        );
        toast.success(
          choice ===
            'mentions'
            ? t(
                'toast-mentions-only',
                {
                  defaultValue:
                    'You will only hear about replies to you and mentions.',
                },
              )
            : t(
                'toast-muted',
                {
                  defaultValue:
                    'Conversation muted.',
                },
              ),
        );
      } catch {
        toast.error(
          t(
            'error-mute',
            {
              defaultValue:
                'Could not mute this conversation.',
            },
          ),
        );
      }
    },
    clear:
      async () => {
        try {
          store(
            await api(
              clearConversationMuteApi,
              {
                params:
                  {
                    id: postId,
                  },
              },
            ),
          );
          toast.success(
            t(
              'toast-unmuted',
              {
                defaultValue:
                  'Conversation unmuted.',
              },
            ),
          );
        } catch {
          toast.error(
            t(
              'error-unmute',
              {
                defaultValue:
                  'Could not unmute this conversation.',
              },
            ),
          );
        }
      },
  };
}

/**
 * The post menu's row: "Mute this conversation" opens the small menu of choices; "Unmute conversation" undoes it in one
 * step. It lives inside the post menu, so `onChoices` closes that menu and opens {@link MuteConversationChoices}.
 */
export function MuteConversationItem({
  mute,
  onChoices,
  onDone,
}: {
  mute: ConversationMute;
  onChoices: () => void;
  onDone: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'conversation-controls',
    );
  if (
    mute.muted
  ) {
    return (
      <MenuItem
        icon={
          Bell
        }
        onSelect={() => {
          onDone();
          void mute.clear();
        }}
      >
        {t(
          'unmute-conversation',
          {
            defaultValue:
              'Unmute conversation',
          },
        )}
      </MenuItem>
    );
  }
  return (
    <MenuItem
      icon={
        BellOff
      }
      onSelect={
        onChoices
      }
    >
      {t(
        'mute',
        {
          defaultValue:
            'Mute this conversation',
        },
      )}
    </MenuItem>
  );
}

/** The four choices, as an overlay anchored where the post menu was. */
export function MuteConversationChoices({
  open,
  onClose,
  anchorRef,
  mute,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  mute: ConversationMute;
}) {
  const {
    t,
  } =
    useTranslation(
      'conversation-controls',
    );
  const choose =

      (
        choice: MuteChoice,
      ) =>
      () => {
        onClose();
        void mute.set(
          choice,
        );
      };
  return (
    <AnchoredMenu
      open={
        open
      }
      onClose={
        onClose
      }
      anchorRef={
        anchorRef
      }
      label={t(
        'mute-menu',
        {
          defaultValue:
            'Mute this conversation',
        },
      )}
      className="w-64"
    >
      <MenuItem
        onSelect={choose(
          'mentions',
        )}
      >
        {t(
          'mute-mentions',
          {
            defaultValue:
              'Mentions only',
          },
        )}
      </MenuItem>
      <MenuItem
        onSelect={choose(
          '24h',
        )}
      >
        {t(
          'mute-24h',
          {
            defaultValue:
              'Mute for 24 hours',
          },
        )}
      </MenuItem>
      <MenuItem
        onSelect={choose(
          '7d',
        )}
      >
        {t(
          'mute-7d',
          {
            defaultValue:
              'Mute for 7 days',
          },
        )}
      </MenuItem>
      <MenuItem
        onSelect={choose(
          'forever',
        )}
      >
        {t(
          'mute-forever',
          {
            defaultValue:
              'Mute until I turn it back on',
          },
        )}
      </MenuItem>
    </AnchoredMenu>
  );
}
