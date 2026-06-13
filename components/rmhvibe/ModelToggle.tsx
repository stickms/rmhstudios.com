/**
 * ModelToggle — a small segmented control to pick the generation model.
 *
 * "Flash" is faster; "Pro" is higher quality. Maps to the `VibeModel` the server
 * understands. Used on the homepage (new page) and in the customize panel.
 */

import { VIBE_MODELS, type VibeModel } from '@/lib/rmhvibe/vibe-types';

const META: Record<VibeModel, { label: string; hint: string }> = {
  flash: { label: 'Flash', hint: 'Faster' },
  pro: { label: 'Pro', hint: 'Higher quality' },
};

export function ModelToggle({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: VibeModel;
  onChange: (model: VibeModel) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`vibe-model-toggle ${className}`} role="radiogroup" aria-label="Generation model">
      {VIBE_MODELS.map((model) => {
        const { label, hint } = META[model];
        const active = value === model;
        return (
          <button
            key={model}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(model)}
            className={`vibe-model-toggle__btn ${active ? 'is-active' : ''}`}
            title={`${label} — ${hint}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
