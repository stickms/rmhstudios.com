import { useTranslation } from 'react-i18next';
import { Crown, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import type { SystemAction } from '@/lib/chat-plus/types';

type ManageAction = Extract<
  SystemAction,
  {
    action: 'rename' | 'add' | 'remove' | 'owner' | 'admin-added' | 'admin-removed';
  }
>;

/**
 * The centred in-chat line for a change to the group itself ("Sam added Alex"). Rendered from `meta`, so each reader
 * gets it in their language; the English `content` fallback is for previews and search.
 */
export function GroupManageLine({
  action,
  viewerId,
  nameOf,
}: {
  action: ManageAction;
  viewerId: string;
  /** Display name for another member; null when unknown (a removed member is no longer in the list). */
  nameOf: (userId: string) => string | null;
}) {
  const { t } = useTranslation('group-chat-admin');
  const who = (id: string) =>
    id === viewerId
      ? t('actor-you', {
          defaultValue: 'You',
        })
      : (nameOf(id) ??
        t('actor-someone', {
          defaultValue: 'Someone',
        }));
  const target = (id: string, stored: string | null) =>
    id === viewerId
      ? t('target-you', {
          defaultValue: 'you',
        })
      : (nameOf(id) ??
        stored ??
        t('actor-someone', {
          defaultValue: 'Someone',
        }));

  let Icon = Pencil;
  let text: string;
  switch (action.action) {
    case 'rename':
      text = t('line-renamed', {
        name: who(action.actorId),
        group: action.name,
        defaultValue: '{{name}} renamed the group to {{group}}',
      });
      break;
    case 'add':
      Icon = UserPlus;
      text = t('line-added', {
        name: who(action.actorId),
        target: target(action.targetId, action.targetName),
        defaultValue: '{{name}} added {{target}}',
      });
      break;
    case 'remove':
      Icon = UserMinus;
      text = t('line-removed', {
        name: who(action.actorId),
        target: target(action.targetId, action.targetName),
        defaultValue: '{{name}} removed {{target}}',
      });
      break;
    case 'owner':
      Icon = Crown;
      text =
        action.targetId === viewerId
          ? t('line-owner-you', {
              defaultValue: 'You are now the owner',
            })
          : t('line-owner', {
              target: target(action.targetId, action.targetName),
              defaultValue: '{{target}} is now the owner',
            });
      break;
    case 'admin-added':
      Icon = ShieldCheck;
      text = t('line-admin-added', {
        ns: 'group-admins',
        name: who(action.actorId),
        target: target(action.targetId, action.targetName),
        defaultValue: '{{name}} made {{target}} an admin',
      });
      break;
    case 'admin-removed': {
      Icon = ShieldOff;
      const removed = t('line-admin-removed', {
        ns: 'group-admins',
        name: who(action.actorId),
        target: target(action.targetId, action.targetName),
        defaultValue: '{{name}} removed {{target}} as an admin',
      });
      text = action.revokedLinks
        ? `${removed}. ${t('line-links-revoked', {
            ns: 'group-admins',
            count: action.revokedLinks,
            defaultValue_one: '{{count}} invite link revoked',
            defaultValue_other: '{{count}} invite links revoked',
          })}`
        : removed;
      break;
    }
  }

  return (
    <div
      role="note"
      className="my-3 flex items-center justify-center gap-1.5 px-6 text-center text-xs text-site-text-muted"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
