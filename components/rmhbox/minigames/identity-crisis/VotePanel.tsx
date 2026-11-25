/**
 * VotePanel — yes, no or maybe on the asker's question.
 *
 * Three labelled buttons. Keys Y, N and M vote while focus is inside this panel
 * (never globally, so they cannot collide with the site shortcuts). A vote is
 * final: once cast the buttons stop, and only the player's own choice is shown,
 * as a word.
 */

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ICVote } from './ic-types';

interface VotePanelProps {
  myVote: ICVote | null;
  /** The asker cannot vote on their own question. */
  canVote: boolean;
  received: number;
  total: number;
  onVote: (vote: ICVote) => void;
}

const KEYS: Record<string, ICVote> = { y: 'yes', n: 'no', m: 'maybe' };

export default function VotePanel({ myVote, canVote, received, total, onVote }: VotePanelProps) {
  const { t } = useTranslation('identity-crisis');
  const groupRef = useRef<HTMLDivElement>(null);
  const open = canVote && myVote === null;

  // Take focus when the vote opens, unless the player is already typing somewhere
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (!active || active === document.body) groupRef.current?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    const vote = KEYS[e.key.toLowerCase()];
    if (vote) {
      e.preventDefault();
      onVote(vote);
    }
  };

  const label = (vote: ICVote): string =>
    vote === 'yes'
      ? t('vote-yes', { defaultValue: 'Yes' })
      : vote === 'no'
        ? t('vote-no', { defaultValue: 'No' })
        : t('vote-maybe', { defaultValue: 'Maybe' });
  const keyHint = (vote: ICVote): string => (vote === 'yes' ? 'Y' : vote === 'no' ? 'N' : 'M');

  return (
    <div className="flex flex-col gap-2" data-testid="ic-vote">
      <div
        ref={groupRef}
        role="group"
        tabIndex={0}
        aria-label={t('vote-group', { defaultValue: 'Your vote. Keys Y, N and M also vote.' })}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-2"
      >
        {(['yes', 'no', 'maybe'] as const).map((vote) => (
          <button
            key={vote}
            type="button"
            disabled={!open}
            aria-pressed={myVote === vote}
            onClick={() => onVote(vote)}
            className={`min-w-24 rounded-app-sm border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
              myVote === vote
                ? 'border-app-accent bg-app-accent text-app-accent-fg'
                : 'border-app-border bg-app-surface text-app-text hover:bg-app-bg'
            }`}
          >
            {label(vote)} <span className="font-mono text-xs">({keyHint(vote)})</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-app-text-muted">
        {!canVote
          ? t('vote-asker', { defaultValue: 'The table is voting on your question.' })
          : myVote
            ? t('vote-cast', { defaultValue: 'Your vote is in: {{vote}}.', vote: label(myVote) })
            : t('vote-open', { defaultValue: 'Vote on the question. Nobody sees who voted what.' })}
        {' · '}
        {t('vote-progress', { defaultValue: '{{received}} of {{total}} voted', received, total })}
      </p>
    </div>
  );
}
