/**
 * The friends list inside the Balatro Invite popover (LOB-04): the viewer's
 * online mutuals (hooks/useActiveFriends — the shared pulse), each with an
 * Invite button that sends a hub invite into this lobby through the running
 * session (lib/balatro/mp/invites.ts). The hub delivers it live and leaves a
 * notification for a friend whose hub connection is gone; it refuses anyone
 * who is not a mutual follow, so the list never offers one.
 *
 * Rendered in InvitePopover's `friends` slot (MpToolbar passes it).
 */
'use client';

import { Check, Loader2, UserPlus } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveFriends } from '@/hooks/useActiveFriends';
import {
  activeInviter,
  inviteFriend,
  subscribeActiveInviter,
  type InviteOutcome,
  type InviterState,
} from '@/lib/balatro/mp/invites';
import './invite-friends.css';

const EMPTY: InviterState = { sent: {}, code: null, inbox: [] };
const noop = () => () => undefined;

function useInviterState(): InviterState {
  const inviter = useSyncExternalStore(subscribeActiveInviter, activeInviter, () => null);
  const subscribe = inviter ? inviter.subscribe : noop;
  const get = inviter ? inviter.getState : () => EMPTY;
  return useSyncExternalStore(subscribe, get, () => EMPTY);
}

export function InviteFriends({ code }: { code: string }) {
  const { t } = useTranslation('c-balatro');
  const { friends } = useActiveFriends(true);
  const state = useInviterState();
  const sent = state.code === code ? state.sent : {};
  const send = useCallback((userId: string) => void inviteFriend(code, userId), [code]);

  const label = (s: InviteOutcome | 'sending' | undefined): string => {
    switch (s) {
      case 'sending':
        return t('mp_invite_sending', { defaultValue: 'Sending…' });
      case 'sent':
        return t('mp_invite_sent', { defaultValue: 'Invited' });
      case 'not-friends':
        return t('mp_invite_not_mutual', { defaultValue: 'Mutual follows only' });
      case 'rate-limited':
        return t('mp_invite_slow_down', { defaultValue: 'Too many invites. Try again in a minute.' });
      case 'offline':
        return t('mp_invite_offline', { defaultValue: 'Offline' });
      case 'not-found':
      case 'auth-required':
      case 'failed':
        return t('mp_invite_failed', { defaultValue: 'Could not invite' });
      default:
        return t('mp_invite_send', { defaultValue: 'Invite' });
    }
  };

  return (
    <section className="balatro-invite-friends" aria-labelledby="balatro-invite-friends-title">
      <h3 id="balatro-invite-friends-title" className="balatro-invite-friends-title">
        {t('mp_invite_friends', { defaultValue: 'Friends online' })}
      </h3>
      {friends === null ? (
        <p className="balatro-invite-friends-empty">{t('mp_invite_friends_loading', { defaultValue: 'Loading friends…' })}</p>
      ) : friends.length === 0 ? (
        <p className="balatro-invite-friends-empty">
          {t('mp_invite_friends_none', { defaultValue: 'No mutual follows online right now.' })}
        </p>
      ) : (
        <ul className="balatro-invite-friends-list">
          {friends.map((f) => {
            const s = sent[f.user.id];
            const name = f.user.name || f.user.username || f.user.handle || '?';
            const busy = s === 'sending';
            const done = s === 'sent';
            return (
              <li key={f.user.id} className="balatro-invite-friend">
                {f.user.image ? (
                  <img src={f.user.image} alt="" className="balatro-invite-friend-avatar" loading="lazy" />
                ) : (
                  <span className="balatro-invite-friend-avatar" aria-hidden />
                )}
                <span className="balatro-invite-friend-name">{name}</span>
                <button
                  type="button"
                  className="balatro-action"
                  disabled={busy || done}
                  onClick={() => send(f.user.id)}
                  aria-label={t('mp_invite_friend', { defaultValue: 'Invite {{name}}', name })}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : done ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <UserPlus className="size-4" aria-hidden />
                  )}
                  {label(s)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
