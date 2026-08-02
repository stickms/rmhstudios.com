'use client';

/**
 * Gabriel's Horn — the record of the table.
 *
 * The server sends the PIECES of each line (`kind` plus a few interpolated
 * fields), never a sentence, so the log translates like everything else. It is
 * also the reason a roll entry carries no total: the roller reads this list
 * too, and one careless field here would undo the whole premise.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogEntry } from '@/lib/gabriels-horn/net/events';
import { useEffectLabel } from './CardFace';

export function TableLog({ log }: { log: LogEntry[] }) {
  const { t } = useTranslation('c-gabriels-horn');
  const effectLabel = useEffectLabel();
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  const line = (entry: LogEntry): string => {
    const actor = entry.actorName ?? '';
    const target = entry.targetName ?? '';
    switch (entry.kind) {
      case 'deal':
        return t('log-deal', {
          defaultValue: 'Dealt {{amount}} cards each.',
          amount: entry.amount,
        });
      case 'roll':
        return t('log-roll', { defaultValue: '{{actor}} rolled — blind.', actor });
      case 'claim':
        return t('log-claim', {
          defaultValue: '{{actor}} says it is {{total}}.',
          actor,
          total: entry.total,
        });
      case 'call':
        return entry.correct
          ? t('log-call-right', {
              defaultValue: '{{actor}} called {{target}} — right. It was {{total}}.',
              actor,
              target,
              total: entry.total,
            })
          : t('log-call-wrong', {
              defaultValue: '{{actor}} called {{target}} — wrong. It was {{total}}.',
              actor,
              target,
              total: entry.total,
            });
      case 'draw':
        return t('log-draw', {
          defaultValue: '{{actor}} draws {{amount}}.',
          actor,
          amount: entry.amount,
        });
      case 'play':
        return target
          ? t('log-play-target', {
              defaultValue: '{{actor}} played {{effect}} on {{target}}.',
              actor,
              target,
              effect: entry.effect ? effectLabel(entry.effect) : '',
            })
          : t('log-play', {
              defaultValue: '{{actor}} played {{effect}}.',
              actor,
              effect: entry.effect ? effectLabel(entry.effect) : '',
            });
      case 'swap':
        return t('log-swap', {
          defaultValue: '{{actor}} swapped hands with {{target}}.',
          actor,
          target,
        });
      case 'ward':
        return t('log-ward', { defaultValue: '{{actor}} is warded — nothing lands.', actor });
      case 'scry':
        return t('log-scry', {
          defaultValue: '{{actor}} looked at {{target}}’s hand.',
          actor,
          target,
        });
      case 'glimpse':
        return t('log-glimpse', { defaultValue: '{{actor}} bought a look at the dice.', actor });
      case 'end-called':
        return t('log-end', {
          defaultValue: '{{actor}} sounded the horn. One turn each, then hands are counted.',
          actor,
        });
      case 'pass':
        return t('log-pass', { defaultValue: '{{actor}} passed.', actor });
      case 'away':
        return t('log-away', {
          defaultValue: '{{actor}} dropped out. Their seat is held for a minute or two.',
          actor,
        });
      case 'returned':
        return t('log-returned', { defaultValue: '{{actor}} is back.', actor });
      case 'skipped':
        return t('log-skipped', { defaultValue: '{{actor}} is away — turn skipped.', actor });
      case 'left':
        return t('log-left', { defaultValue: '{{actor}} left the table.', actor });
      case 'house-rules':
        return t('log-house-rules', {
          defaultValue: '{{actor}} changed the rules: {{changes}}.',
          actor,
          changes: (entry.changes ?? []).map((c) => `${c.key} ${c.from} → ${c.to}`).join(', '),
        });
      case 'over':
        return t('log-over', { defaultValue: 'Hands counted.' });
      default:
        return '';
    }
  };

  if (log.length === 0) {
    return (
      <p className="text-xs text-(--app-text-dim)">
        {t('log-empty', { defaultValue: 'Nothing has happened yet.' })}
      </p>
    );
  }

  return (
    <ol className="app-scroll-y max-h-40 space-y-1 text-xs text-(--app-text-muted)">
      {log.map((entry, index) => (
        <li key={entry.id} ref={index === log.length - 1 ? endRef : undefined}>
          {line(entry)}
        </li>
      ))}
    </ol>
  );
}
