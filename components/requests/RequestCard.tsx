'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, Megaphone, GitMerge } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isVotable } from '@/lib/requests/status';
import type { FeatureRequestDTO } from '@/lib/requests/schema';
import { RequestStatusBadge } from './RequestStatusBadge';
import { RequestAdminPanel } from './RequestAdminPanel';

interface RequestCardProps {
  request: FeatureRequestDTO;
  signedIn: boolean;
  isAdmin: boolean;
  onChanged: (next: FeatureRequestDTO) => void;
  onVoted: (requestId: string, voteCount: number, hasVoted: boolean) => void;
}

/**
 * One request on the board.
 *
 * The official reply is rendered *inside* the card, not behind a "read more":
 * a declined request whose reason takes a click to find reads exactly like a
 * declined request with no reason at all, which is the outcome this whole
 * feature exists to avoid.
 */
export function RequestCard({
  request,
  signedIn,
  isAdmin,
  onChanged,
  onVoted,
}: RequestCardProps) {
  const { t } = useTranslation('c-roadmap');
  const [voting, setVoting] = useState(false);
  const votable = isVotable(request);

  async function vote() {
    if (!signedIn) {
      toast.error(t('request-sign-in', { defaultValue: 'Sign in to vote on requests' }));
      return;
    }
    setVoting(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/vote`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? t('request-vote-failed', { defaultValue: 'Could not vote' }));
        return;
      }
      const data = (await res.json()) as {
        requestId: string;
        voteCount: number;
        hasVoted: boolean;
      };
      onVoted(data.requestId, data.voteCount, data.hasVoted);
    } finally {
      setVoting(false);
    }
  }

  return (
    <article className="glass-fill rounded-site p-4">
      <div className="flex items-start gap-3">
        <Button
          variant={request.hasVoted ? 'accent' : 'outline'}
          size="sm"
          className="h-auto shrink-0 flex-col gap-0.5 px-3 py-2"
          onClick={vote}
          loading={voting}
          disabled={!votable}
          aria-pressed={request.hasVoted}
          aria-label={
            request.hasVoted
              ? t('request-unvote', { defaultValue: 'Remove your vote' })
              : t('request-vote', { defaultValue: 'Vote for this request' })
          }
        >
          <ChevronUp aria-hidden />
          <span className="font-mono text-xs">{request.voteCount.toLocaleString()}</span>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 font-display text-base font-semibold text-site-text">
              {request.title}
            </h3>
            <RequestStatusBadge status={request.status} />
          </div>

          <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-site-text-muted">
            {request.body}
          </p>

          {request.mergedIntoTitle ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-site-text-dim">
              <GitMerge className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('request-merged-into', {
                defaultValue: 'Merged into “{{title}}” — your vote moved with it.',
                title: request.mergedIntoTitle,
              })}
            </p>
          ) : null}

          {request.officialNote ? (
            <div className="glass-inset mt-3 rounded-site p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-site-accent">
                <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('request-official-reply', { defaultValue: 'Official reply' })}
              </p>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-site-text">
                {request.officialNote}
              </p>
            </div>
          ) : null}

          <p className={cn('mt-2 text-xs text-site-text-dim')}>
            {t('request-by', {
              defaultValue: 'Requested by {{name}}',
              name: request.author?.handle
                ? `@${request.author.handle}`
                : (request.author?.name ??
                  t('request-anonymous', { defaultValue: 'someone' })),
            })}
          </p>

          {isAdmin ? <RequestAdminPanel request={request} onChanged={onChanged} /> : null}
        </div>
      </div>
    </article>
  );
}
