import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { FieldHeader } from './FieldHeader';
import { MAX_HANDLE, type HandleStatus } from './profile-edit-state';

function formatCooldown(ms: number, t: TFunction<'feed'>): string {
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 1) {
    return t('cooldown-less-than-a-day', { defaultValue: 'less than a day' });
  }
  return t('cooldown-days', { days, defaultValue: '{{days}} days' });
}

export function HandleField({
  handle,
  status,
  changed,
  onCooldown,
  cooldownMs,
  onChange,
}: {
  handle: string;
  status: HandleStatus;
  changed: boolean;
  onCooldown: boolean;
  cooldownMs: number;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div>
      <FieldHeader
        htmlFor="profile-handle"
        label={t('handle-label', { defaultValue: 'Handle' })}
        count={`${handle.length}/${MAX_HANDLE}`}
      />
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-site-text-muted">
          @
        </span>
        <Input
          id="profile-handle"
          value={handle}
          onChange={(event) => onChange(event.target.value)}
          disabled={onCooldown}
          className={cn(
            'pl-8 pr-10',
            changed && status === 'available' && 'border-site-success',
            changed && (status === 'taken' || status === 'invalid') && 'border-site-danger',
          )}
          aria-invalid={changed && (status === 'taken' || status === 'invalid')}
        />
        {changed && status === 'checking' ? (
          <Spinner size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2" />
        ) : null}
        {changed && status === 'available' ? (
          <Check
            className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-site-success"
            aria-hidden
          />
        ) : null}
        {changed && (status === 'taken' || status === 'invalid') ? (
          <X
            className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-site-danger"
            aria-hidden
          />
        ) : null}
      </div>
      <p
        className={cn(
          'mt-2 text-xs',
          status === 'available'
            ? 'text-site-success'
            : status === 'taken' || status === 'invalid'
              ? 'text-site-danger'
              : 'text-site-text-muted',
        )}
      >
        {onCooldown
          ? t('handle-cooldown', {
              cooldown: formatCooldown(cooldownMs, t),
              defaultValue: 'You can change your handle again in {{cooldown}}',
            })
          : changed && status === 'available'
            ? t('handle-available', { defaultValue: 'Handle is available' })
            : changed && status === 'taken'
              ? t('handle-taken', { defaultValue: 'Handle is already taken' })
              : changed && status === 'invalid'
                ? t('handle-invalid-hint', {
                    defaultValue:
                      'Use 3–20 lowercase letters, numbers, or underscores; start with a letter.',
                  })
                : t('handle-hint', {
                    defaultValue: 'Used for mentions and your profile URL.',
                  })}
      </p>
    </div>
  );
}
