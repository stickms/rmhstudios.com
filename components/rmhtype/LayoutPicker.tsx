/**
 * The keyboard layout picker: a labelled select of the four layouts RMHType knows. It only reports a choice; where
 * the choice is kept (`useLayoutPref`, `lib/rmhtype/layout-pref.ts`) is the page's business.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, type SelectTier } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TYPING_LAYOUTS, type TypingLayout } from '@/lib/rmhtype/keystats';

interface LayoutPickerProps {
  value: TypingLayout;
  onChange: (layout: TypingLayout) => void;
  tier?: SelectTier;
  className?: string;
}

export function LayoutPicker({ value, onChange, tier, className }: LayoutPickerProps) {
  const { t } = useTranslation('type-layouts');
  const id = useId();
  const names: Record<TypingLayout, string> = {
    qwerty: t('layout-qwerty', { defaultValue: 'QWERTY' }),
    azerty: t('layout-azerty', { defaultValue: 'AZERTY' }),
    dvorak: t('layout-dvorak', { defaultValue: 'Dvorak' }),
    colemak: t('layout-colemak', { defaultValue: 'Colemak' }),
  };
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="text-sm text-app-text-muted">
        {t('layout-label', { defaultValue: 'Keyboard layout' })}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as TypingLayout)}
        controlSize="sm"
        containerClassName="min-w-32"
        {...(tier ? { tier } : {})}
      >
        {TYPING_LAYOUTS.map((layout) => (
          <option key={layout} value={layout}>
            {names[layout]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** What a unit the layout's course leaves out says in place of its lessons. */
export function NotInCourseNote({ layout }: { layout: TypingLayout }) {
  const { t } = useTranslation('type-layouts');
  return (
    <p className="mt-2 border-t border-app-border pt-3 text-sm text-app-text-muted">
      {layout === 'azerty'
        ? t('not-in-azerty', {
            defaultValue:
              'Not part of the AZERTY course. AZERTY digits and punctuation need Shift, and a full symbol course is still to come.',
          })
        : t('not-in-course', { defaultValue: 'Not part of this course.' })}
    </p>
  );
}
