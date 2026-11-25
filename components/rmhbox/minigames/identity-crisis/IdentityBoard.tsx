/**
 * IdentityBoard — everyone's identity but your own, which is a "?".
 *
 * One row per player on a rule: the name, the identity (or "?"), and in words
 * who is asking and who has stopped asking or solved it, so nothing depends on
 * colour. A spectator sees every identity; the board is the same list.
 */

import { useTranslation } from 'react-i18next';
import type { ICOther, ICStatus } from './ic-types';

interface IdentityBoardProps {
  /** The viewer's own id (null for a spectator). */
  myId: string | null;
  myName: string;
  /** Everyone's identity but the viewer's own. */
  others: ICOther[];
  /** Player order for display: the turn order once known. */
  order: string[];
  statuses: Record<string, ICStatus>;
  scores: Record<string, number>;
  askerId: string | null;
}

export default function IdentityBoard({ myId, myName, others, order, statuses, scores, askerId }: IdentityBoardProps) {
  const { t } = useTranslation('identity-crisis');

  const rows: Array<{ userId: string; userName: string; identity: string | null; category: string | null }> =
    others.map((o) => ({
      userId: o.userId,
      userName: o.userName,
      identity: o.identity.name,
      category: o.identity.category,
    }));
  if (myId) rows.push({ userId: myId, userName: myName, identity: null, category: null });
  const rank = (id: string) => {
    const at = order.indexOf(id);
    return at === -1 ? order.length : at;
  };
  rows.sort((a, b) => rank(a.userId) - rank(b.userId));

  return (
    <ul
      className="border-t border-app-border"
      aria-label={t('board-label', { defaultValue: 'Who is who' })}
      data-testid="ic-board"
    >
      {rows.map((row) => {
        const status = statuses[row.userId];
        const mine = row.userId === myId;
        let note = '';
        if (row.userId === askerId) note = t('note-asking', { defaultValue: 'Asking' });
        else if (status === 'solved') note = t('note-solved', { defaultValue: 'Solved' });
        else if (status === 'stopped') note = t('note-stopped', { defaultValue: 'Out of questions' });
        return (
          <li
            key={row.userId}
            className={`flex items-center justify-between gap-3 border-b border-app-border py-2 text-sm ${
              mine ? 'font-semibold text-app-text' : 'text-app-text'
            }`}
          >
            <span className="min-w-0 flex-1 truncate" dir="auto">
              <bdi>{row.userName}</bdi>
              {mine ? ` · ${t('board-you', { defaultValue: 'You' })}` : ''}
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-end">
              {row.identity === null ? (
                <span aria-label={t('board-hidden', { defaultValue: 'Hidden from you' })}>?</span>
              ) : (
                <>
                  <span className="truncate" dir="auto">
                    <bdi>{row.identity}</bdi>
                  </span>
                  <span className="truncate text-xs text-app-text-muted">{row.category}</span>
                </>
              )}
            </span>
            <span className="w-24 text-end text-xs text-app-text-muted">
              {note}
              {note ? ' · ' : ''}
              <span className="font-mono tabular-nums">{scores[row.userId] ?? 0}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
