import { useTranslation } from 'react-i18next';
import type { Poll } from './group-chat-state';

export function PollView({ poll, onVote }: { poll: Poll; onVote: (idx: number) => void }) {
  const { t } = useTranslation('feed');
  const voted = poll.myVote !== null;
  return (
    <div className="mt-1.5 w-64 max-w-full rounded-site glass-fill p-4">
      <p className="mb-2 text-sm font-semibold text-site-text">{poll.question}</p>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((o, i) => {
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const chosen = poll.myVote === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onVote(i)}
              className={`relative overflow-hidden rounded-site-sm border px-3 py-1.5 text-left text-sm transition-colors ${chosen ? 'border-site-accent' : 'border-site-border hover:border-site-accent/60'}`}
            >
              {voted && (
                <span
                  className="absolute inset-y-0 left-0 bg-site-accent-dim"
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span
                  className={`truncate ${chosen ? 'font-semibold text-site-text' : 'text-site-text'}`}
                >
                  {o.text}
                </span>
                {voted && <span className="shrink-0 text-xs text-site-text-dim">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-site-text-dim">
        {t('poll-votes', { count: poll.totalVotes, defaultValue: '{{count}} votes' })}
      </p>
    </div>
  );
}
