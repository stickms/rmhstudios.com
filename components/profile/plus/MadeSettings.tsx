import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { MADE_KINDS, type MadeKind } from '@/lib/profile/made';
import { madeKindLabels } from './made-labels';

/** The layout editor's setting for "Made here": which kinds of work the module lists. All are ticked by default. */
export function MadeSettings({
  kinds,
  onChange,
}: {
  kinds: readonly MadeKind[];
  onChange: (next: MadeKind[]) => void;
}) {
  const { t } = useTranslation('profile-made');
  const labels = madeKindLabels(t);
  const heading = t('settings-heading', { defaultValue: 'Show in Made here' });
  return (
    <div role="group" aria-label={heading} className="mt-3">
      <p className="t-label mb-1">{heading}</p>
      <ul>
        {MADE_KINDS.map((kind) => {
          const on = kinds.includes(kind);
          return (
            <li key={kind} className="flex items-center justify-between gap-3 border-b border-site-border py-2">
              <span className="t-body">{labels[kind]}</span>
              <Switch
                checked={on}
                aria-label={labels[kind]}
                onCheckedChange={(next) => onChange(MADE_KINDS.filter((k) => (k === kind ? next : kinds.includes(k))))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
