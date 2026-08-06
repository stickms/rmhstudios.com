'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Bot } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { cn } from '@/lib/utils';
import {
  entryValueCents,
  formatDebt,
  type DebtCategory,
  type DebtEntryDto,
} from '@/lib/kaikai-debt/debt';

/**
 * Category → emoji. Not `--site-*` colours: a coloured chip per category would
 * need eight new tokens in every theme to say something an emoji says in one
 * character, and the log is dense enough that eight tints would read as noise.
 */
const CATEGORY_GLYPH: Record<DebtCategory, string> = {
  food: '🍔',
  transit: '🚌',
  rent: '🏠',
  gear: '🔌',
  gambling: '🎲',
  emotional: '💔',
  temporal: '⏳',
  other: '🧾',
};

/**
 * Elapsed time, translated.
 *
 * `formatRelativeTime` from `lib/utils` is not used here for two reasons: it
 * reads `Date.now()` itself (so it cannot take the shared clock `RelativeTime`
 * hands it, and would re-introduce the hydration mismatch that component exists
 * to prevent), and its strings are hardcoded English. This log runs to years of
 * back-dated history, so it also needs a scale that does not stop at "d".
 */
function relativeLabel(ms: number, now: number, t: TFunction): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 60) return t('log.justNow', { defaultValue: 'just now' });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('log.minutesAgo', { defaultValue: '{{count}}m ago', count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('log.hoursAgo', { defaultValue: '{{count}}h ago', count: hours });
  const days = Math.floor(hours / 24);
  if (days < 365) return t('log.daysAgo', { defaultValue: '{{count}}d ago', count: days });
  const years = Math.floor(days / 365);
  return t('log.yearsAgo', { defaultValue: '{{count}}y ago', count: years });
}

interface DebtLogRowProps {
  entry: DebtEntryDto;
  /** Passed in rather than read from a clock so a whole page shares one instant. */
  nowMs: number;
  /** Play the arrival flash. Only ever true for a line that landed while you watched. */
  fresh?: boolean;
}

/**
 * One line of the debt log: what he owes, why, what it was worth then, and what
 * it is worth now.
 *
 * `.glass-fill` and not `.glass-pane` — L1, no backdrop blur. This is a repeated
 * list item on an infinite list, and the budget for blurred surfaces is **zero**
 * on repeated content (components/CLAUDE.md). A hundred blurred rows is a
 * hundred backdrop samples per frame while the reader is actively scrolling,
 * which is the exact interaction this page is built around.
 *
 * The "now worth" figure is the reason a $6 line is worth reading on a page
 * whose headline is in the millions: it is where an individual debt's growth is
 * legible. It is only rendered once it has actually diverged from face value —
 * a line added ten seconds ago showing "now $6.00" is noise.
 */
export function DebtLogRow({ entry, nowMs, fresh }: DebtLogRowProps) {
  const { t } = useTranslation('c-kaikai-debt');

  // A member row is attributed to whoever wrote it; a generated one to whoever
  // it is owed to. Either way there is at most one person on the row, so the
  // choice is made once here rather than branched twice in the markup.
  const person = entry.source === 'member' ? entry.addedBy : entry.creditor;
  const personLabel = person
    ? person.handle
      ? `@${person.handle}`
      : (person.name ?? t('log.someone', { defaultValue: 'someone' }))
    : '';

  const nowCents = entryValueCents(entry.amountCents, entry.createdAtMs, nowMs);
  // 1% clear of face value — below that the two numbers render identically and
  // the row just looks like it is repeating itself.
  const grown = nowCents > entry.amountCents * 1.01;

  return (
    <li className={cn('glass-fill flex items-start gap-3 rounded-site p-4', fresh && 'kd-flash')}>
      <span className="text-xl leading-none" aria-hidden>
        {CATEGORY_GLYPH[entry.category]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 font-medium text-site-text">{entry.item}</p>
          <p className="shrink-0 font-display font-semibold text-site-text tabular-nums">
            {formatDebt(entry.amountCents)}
          </p>
        </div>

        <p className="mt-1 text-sm text-site-text-muted">{entry.note}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-site-text-muted">
          {/* Two different facts, deliberately worded differently. A member row
              names its AUTHOR ("added by") — they put it on the tab. A generated
              row has no author, so it names its CREDITOR ("owed to") instead:
              saying "added by" there would be a false claim that the person
              logged something they never touched. */}
          {person && (
            <span className="flex items-center gap-1.5">
              <UserAvatar
                src={person.image}
                alt=""
                size={16}
                fallbackName={person.name ?? undefined}
              />
              {entry.source === 'member'
                ? t('log.addedBy', { defaultValue: 'added by {{name}}', name: personLabel })
                : t('log.owedTo', { defaultValue: 'owed to {{name}}', name: personLabel })}
            </span>
          )}

          {entry.source === 'ledger' && (
            <span className="flex items-center gap-1.5">
              <Bot className="size-3.5" aria-hidden />
              {t('log.fromArchive', { defaultValue: 'recovered from the archive' })}
            </span>
          )}

          <RelativeTime date={entry.createdAtMs} format={(ms, now) => relativeLabel(ms, now, t)} />

          {grown && (
            <span className="text-site-accent tabular-nums">
              {t('log.nowWorth', {
                defaultValue: 'now {{amount}} with interest',
                amount: formatDebt(nowCents),
              })}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
