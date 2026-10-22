'use client';

import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { anyModifier, MODIFIER_KEYS, type PartyModifiers } from '@/lib/bums-rush/modifiers';

function useLabels() {
  const { t } = useTranslation('f-action');
  return {
    title: t('br-mods-title', { defaultValue: 'Party modifiers' }),
    note: t('br-mods-note', {
      defaultValue:
        'Wobbly rules for fun. Runs with modifiers never count toward clears or boards.',
    }),
    lowGravity: t('br-mod-low-gravity', { defaultValue: 'Low gravity' }),
    stickyHands: t('br-mod-sticky-hands', { defaultValue: 'Sticky hands' }),
    giantHeads: t('br-mod-giant-heads', { defaultValue: 'Giant heads' }),
  } as const;
}

/** Create-room toggles. */
export function PartyModifierToggles({
  value,
  onChange,
}: {
  value: PartyModifiers;
  onChange: (next: PartyModifiers) => void;
}) {
  const labels = useLabels();
  return (
    <fieldset className="mt-4 space-y-2">
      <legend className="text-sm font-semibold text-bum-ink">{labels.title}</legend>
      <p className="text-xs text-bum-graphite">{labels.note}</p>
      {MODIFIER_KEYS.map((key) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <span id={`br-mod-${key}`} className="text-sm text-bum-ink">
            {labels[key]}
          </span>
          <Switch
            aria-labelledby={`br-mod-${key}`}
            checked={value[key]}
            onCheckedChange={(on) => onChange({ ...value, [key]: on })}
          />
        </div>
      ))}
    </fieldset>
  );
}

/** What the room is running, for everyone inside it. */
export function PartyModifierBadges({ modifiers }: { modifiers: PartyModifiers | undefined }) {
  const labels = useLabels();
  if (!anyModifier(modifiers) || !modifiers) return null;
  return (
    <p className="text-sm text-bum-ink" role="status">
      <span className="font-semibold">{labels.title}: </span>
      {MODIFIER_KEYS.filter((k) => modifiers[k])
        .map((k) => labels[k])
        .join(', ')}
    </p>
  );
}
