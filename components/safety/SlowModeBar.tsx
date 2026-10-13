import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { useSlowModeStore } from '@/lib/safety/slow-mode-store';
import { SLOW_MODE_CHOICES_S, type SlowModeScope } from '@/lib/safety/slow-mode-events';

/** Seconds left on the composer lock for `scope` (0 = free to send). */
export function useSlowModeBlock(scope: SlowModeScope): {
  secondsLeft: number;
  newAccount: boolean;
} {
  const entry = useSlowModeStore((s) => s.scopes[scope]);
  const until = entry?.blockedUntil ?? 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until]);
  return {
    secondsLeft: until > now ? Math.ceil((until - now) / 1000) : 0,
    newAccount: entry?.reason === 'new-account',
  };
}

/**
 * Slow-mode strip above a chat composer: the countdown after a rejection, the
 * active cooldown for everyone, and (host only) the cooldown picker.
 */
export function SlowModeBar({
  scope,
  isHost,
  onSet,
  className = 'text-site-text-dim',
  tier = 'site',
}: {
  scope: SlowModeScope;
  isHost: boolean;
  onSet: (seconds: number) => void;
  className?: string;
  tier?: 'site' | 'app';
}) {
  const { t } = useTranslation('f-safety');
  const entry = useSlowModeStore((s) => s.scopes[scope]);
  const { secondsLeft, newAccount } = useSlowModeBlock(scope);
  const cooldownS = Math.round((entry?.cooldownMs ?? 0) / 1000);
  const active = cooldownS > 0 || !!entry?.autoEngaged;
  if (!active && !isHost && secondsLeft === 0 && !newAccount) return null;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 text-xs ${className}`}
      role="status"
      aria-live="polite"
    >
      <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {newAccount && secondsLeft === 0
          ? t('slow-new-account', {
              defaultValue: 'Chat is paused for brand-new accounts while the room is busy.',
            })
          : secondsLeft > 0
            ? t('slow-wait', {
                defaultValue: 'Slow mode: wait {{seconds}}s to send again',
                seconds: secondsLeft,
              })
            : active
              ? t('slow-active', {
                  defaultValue: 'Slow mode is on ({{seconds}}s between messages)',
                  seconds: Math.max(cooldownS, entry?.autoEngaged ? 10 : 0),
                })
              : t('slow-off', { defaultValue: 'Slow mode is off' })}
      </span>
      {isHost && (
        <Select
          tier={tier}
          controlSize="sm"
          containerClassName="inline-block w-auto"
          className="w-auto min-w-20"
          aria-label={t('slow-set-label', { defaultValue: 'Slow mode cooldown' })}
          value={cooldownS}
          onChange={(e) => onSet(Number(e.target.value))}
        >
          {SLOW_MODE_CHOICES_S.map((s) => (
            <option key={s} value={s}>
              {s === 0
                ? t('slow-choice-off', { defaultValue: 'Off' })
                : s >= 60
                  ? t('slow-choice-min', { defaultValue: '{{minutes}} min', minutes: s / 60 })
                  : t('slow-choice-sec', { defaultValue: '{{seconds}}s', seconds: s })}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
