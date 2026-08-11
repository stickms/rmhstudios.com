'use client';

/**
 * One day, in full: the write-up plus every figure the tracker recorded.
 *
 * Shared by the calendar's selection panel and by `/sohumbum2/<date>`, so a
 * shared link and a click on the grid show exactly the same thing — which is
 * what makes the link worth sharing.
 *
 * The facts are laid out as a dense grid rather than prose because that is what
 * they are: a list of measurements. The prose above them is the model's job.
 */

import { Link } from '@tanstack/react-router';
import { Check, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCount, formatDuration } from '@/lib/sohumbum2/config';
import { formatDayLong } from '@/lib/sohumbum2/dates';
import type { WatchDayDTO } from '@/lib/sohumbum2/types';
import { SummaryCard } from './SummaryCard';

interface DayDetailProps {
  day: WatchDayDTO;
  /** Hidden on the day's own permalink, where the link IS the page. */
  showPermalink?: boolean;
}

export function DayDetail({ day, showPermalink = true }: DayDetailProps) {
  const { t } = useTranslation('r-sohumbum2');
  const [copied, setCopied] = useState(false);

  const quiet = day.voiceSec === 0 && day.messages === 0 && day.gamingSec === 0;

  const copyLink = async () => {
    const url = `${window.location.origin}/sohumbum2/${day.dateKey}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The
      // permalink beside this button still works, so a failed copy needs no
      // error state — it just does not flip to "copied".
    }
  };

  // Literal keys, one `t()` per fact: a data table of {key,label} would read
  // better and would extract nothing (`i18next-parser` is a static scanner).
  const facts: Array<{ id: string; label: string; value: string } | null> = [
    {
      id: 'voice',
      label: t('fact-voice', { defaultValue: 'In voice' }),
      value: formatDuration(day.voiceSec),
    },
    {
      id: 'sessions',
      label: t('fact-sessions', { defaultValue: 'Voice sessions' }),
      value: formatCount(day.voiceSessions),
    },
    {
      id: 'longest',
      label: t('fact-longest', { defaultValue: 'Longest stretch' }),
      value: formatDuration(day.longestVoiceSec),
    },
    {
      id: 'alone',
      label: t('fact-alone', { defaultValue: 'Alone in the channel' }),
      value: formatDuration(day.aloneSec),
    },
    {
      id: 'muted',
      label: t('fact-muted', { defaultValue: 'Muted' }),
      value: formatDuration(day.mutedSec),
    },
    {
      id: 'deafened',
      label: t('fact-deafened', { defaultValue: 'Deafened' }),
      value: formatDuration(day.deafenedSec),
    },
    day.streamingSec > 0
      ? {
          id: 'streaming',
          label: t('fact-streaming', { defaultValue: 'Streaming' }),
          value: formatDuration(day.streamingSec),
        }
      : null,
    {
      id: 'late-voice',
      label: t('fact-late-voice', { defaultValue: 'In voice after midnight' }),
      value: formatDuration(day.lateNightSec),
    },
    {
      id: 'messages',
      label: t('fact-messages', { defaultValue: 'Messages' }),
      value: formatCount(day.messages),
    },
    {
      id: 'words',
      label: t('fact-words', { defaultValue: 'Words typed' }),
      value: formatCount(day.words),
    },
    {
      id: 'questions',
      label: t('fact-questions', { defaultValue: 'Questions asked' }),
      value: formatCount(day.questions),
    },
    {
      id: 'late-messages',
      label: t('fact-late-messages', { defaultValue: 'Messages after midnight' }),
      value: formatCount(day.lateNightMessages),
    },
    {
      id: 'links',
      label: t('fact-links', { defaultValue: 'Links shared' }),
      value: formatCount(day.links),
    },
    {
      id: 'reactions-given',
      label: t('fact-reactions-given', { defaultValue: 'Reactions given' }),
      value: formatCount(day.reactionsGiven),
    },
    {
      id: 'reactions-received',
      label: t('fact-reactions-received', { defaultValue: 'Reactions received' }),
      value: formatCount(day.reactionsReceived),
    },
    {
      id: 'gaming',
      label: t('fact-gaming', { defaultValue: 'In games' }),
      value: formatDuration(day.gamingSec),
    },
    day.topGame
      ? {
          id: 'top-game',
          label: t('fact-top-game', { defaultValue: 'Most-played' }),
          value: `${day.topGame} · ${formatDuration(day.topGameSec)}`,
        }
      : null,
    day.topChannel
      ? {
          id: 'top-channel',
          label: t('fact-top-channel', { defaultValue: 'Busiest channel' }),
          value: `#${day.topChannel}`,
        }
      : null,
  ];

  return (
    <div className="sb2-detail">
      <div className="sb2-detail__head">
        <h3 className="sb2-detail__title">{formatDayLong(day.dateKey)}</h3>
        {showPermalink ? (
          <>
            <button type="button" className="sb2-btn sb2-btn--ghost" onClick={copyLink}>
              {copied ? <Check aria-hidden size={15} /> : <Link2 aria-hidden size={15} />}
              {copied
                ? t('share-copied', { defaultValue: 'Copied' })
                : t('share-copy', { defaultValue: 'Copy link' })}
            </button>
            <Link
              to="/sohumbum2/$date"
              params={{ date: day.dateKey }}
              className="sb2-btn sb2-btn--ghost"
            >
              {t('share-open', { defaultValue: 'Open this day' })}
            </Link>
          </>
        ) : null}
      </div>

      {quiet ? (
        <p className="sb2-empty">
          <span className="sb2-empty__title">
            {t('day-quiet-title', { defaultValue: 'Nothing recorded' })}
          </span>
          <span className="sb2-empty__body">
            {t('day-quiet-body', {
              defaultValue:
                'No voice, no messages, no games. Either he was doing something else or he was not online at all — this page cannot tell the two apart, and neither can his résumé.',
            })}
          </span>
        </p>
      ) : (
        <>
          <SummaryCard
            summary={day.summary}
            emptyTitle={t('day-summary-pending-title', { defaultValue: 'No write-up yet' })}
            emptyBody={t('day-summary-pending-body', {
              defaultValue:
                'The day is summarised once its figures settle. The measurements below are already final.',
            })}
          />

          <div className="sb2-facts">
            {facts.filter((fact) => fact !== null).map((fact) => (
              <div key={fact.id} className="sb2-fact">
                <span className="sb2-fact__label">{fact.label}</span>
                <span className="sb2-fact__value">{fact.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
