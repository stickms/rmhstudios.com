import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Track / Untrack for one achievement; the label names it so a screen reader can tell the rows apart. */
export function TrackToggle({
  name,
  tracked,
  busy,
  onToggle,
}: {
  name: string;
  tracked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('achievement-tracker');
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      className={tracked ? 'border-site-text font-semibold' : 'text-site-text-muted'}
      disabled={busy}
      onClick={onToggle}
      aria-pressed={tracked}
      aria-label={t('track-named', {
        name,
        defaultValue: 'Track {{name}}',
      })}
    >
      {tracked
        ? t('untrack', {
            defaultValue: 'Untrack',
          })
        : t('track', {
            defaultValue: 'Track',
          })}
    </Button>
  );
}
