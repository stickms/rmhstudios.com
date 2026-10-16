import { useTranslation } from 'react-i18next';
import { BookOpen, Code2, Keyboard } from 'lucide-react';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import type { SoloSource } from '@/lib/rmhtype/sources';

/** Passage-source switch for RMHType solo: standard, real code, or site lore. */
export function SoloSourcePicker({
  value,
  onChange,
}: {
  value: SoloSource;
  onChange: (v: SoloSource) => void;
}) {
  const { t } = useTranslation('f-tools');
  const tabs = [
    {
      id: 'standard',
      label: t('type-source-standard', { defaultValue: 'Standard' }),
      icon: Keyboard,
    },
    { id: 'code', label: t('type-source-code', { defaultValue: 'Code' }), icon: Code2 },
    { id: 'lore', label: t('type-source-lore', { defaultValue: 'Site lore' }), icon: BookOpen },
  ];
  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-(--app-text-muted)">
        {t('type-source-label', { defaultValue: 'Passage source' })}
      </span>
      <LiquidTabs
        tabs={tabs}
        value={value}
        onChange={(id) => onChange(id as SoloSource)}
        size="sm"
        sheet={false}
        aria-label={t('type-source-label', { defaultValue: 'Passage source' })}
      />
      {value !== 'standard' && (
        <p className="mt-1.5 text-xs text-(--app-text-muted)">
          {value === 'code'
            ? t('type-source-code-hint', {
                defaultValue:
                  'Real code with line breaks. Press Enter at the end of a line; indentation fills in for you. Practice only.',
              })
            : t('type-source-lore-hint', {
                defaultValue: 'Sentences from recent RMH news. Practice only.',
              })}
        </p>
      )}
    </div>
  );
}

/** Result-screen note for a run that was not eligible for the leaderboard. */
export function SourcePracticeNote({ source }: { source: SoloSource }) {
  const { t } = useTranslation('f-tools');
  return (
    <p className="text-sm text-(--app-text-muted) mb-4">
      {source === 'code'
        ? t('type-practice-code', {
            defaultValue: 'Code run - practice only, so it is not posted to the leaderboard.',
          })
        : t('type-practice-lore', {
            defaultValue: 'Site-lore run - practice only, so it is not posted to the leaderboard.',
          })}
    </p>
  );
}
