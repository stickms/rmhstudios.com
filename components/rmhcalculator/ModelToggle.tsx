/**
 * ModelToggle — segmented switch (one JellyGroup, flat members) between DeepSeek Reasoner and DeepSeek Chat.
 *
 * Reasoner is the accurate default (streams its working); Chat trades depth for
 * speed. Purely presentational — the parent owns the value and persistence.
 */

import { Brain, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CALC_MODELS, CALC_MODEL_META, type CalcModel } from '@/lib/rmhcalculator/types';
import { JellyGroup } from '@/components/ui/jelly-group';

const ICONS: Record<CalcModel, typeof Brain> = { reasoner: Brain, chat: Zap };

export function ModelToggle({
  value,
  onChange,
  disabled,
  className,
}: {
  value: CalcModel;
  onChange: (model: CalcModel) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhcalculator');

  return (
    <JellyGroup
      size="sm"
      role="radiogroup"
      aria-label={t('model-label', { defaultValue: 'Calculation model' })}
      className={className}
    >
      {CALC_MODELS.map((model) => {
        const Icon = ICONS[model];
        const active = model === value;
        const meta = CALC_MODEL_META[model];
        return (
          <JellyGroup.Item
            key={model}
            role="radio"
            aria-checked={active}
            // A radio, not a toggle: its state is `aria-checked`.
            aria-pressed={undefined}
            selected={active}
            disabled={disabled}
            title={meta.hint}
            onClick={() => onChange(model)}
            className="font-semibold"
          >
            <Icon size={14} aria-hidden="true" />
            <span>
              {model === 'reasoner'
                ? t('model-reasoner', { defaultValue: 'Reasoner' })
                : t('model-chat', { defaultValue: 'Chat' })}
            </span>
          </JellyGroup.Item>
        );
      })}
    </JellyGroup>
  );
}
