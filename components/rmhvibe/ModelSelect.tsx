/**
 * ModelSelect — a dropdown to pick the generation model.
 *
 * Lists every available model grouped by provider (Kimi, DeepSeek), each tagged
 * with a quality/speed hint. Maps to the `VibeModel` the server understands. Used
 * on the homepage (new page) and in the customize panel.
 */

import { ChevronDown } from 'lucide-react';
import {
  VIBE_MODEL_META,
  VIBE_MODELS,
  VIBE_PROVIDER_LABELS,
  VIBE_PROVIDER_ORDER,
  type VibeModel,
} from '@/lib/rmhvibe/vibe-types';

export function ModelSelect({
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
    <div className={`vibe-model-select ${className}`}>
      <select
        className="vibe-model-select__input"
        aria-label="Generation model"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as VibeModel)}
      >
        {VIBE_PROVIDER_ORDER.map((provider) => (
          <optgroup key={provider} label={VIBE_PROVIDER_LABELS[provider]}>
            {VIBE_MODELS.filter((m) => VIBE_MODEL_META[m].provider === provider).map((m) => (
              <option key={m} value={m}>
                {VIBE_MODEL_META[m].label} — {VIBE_MODEL_META[m].hint}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="vibe-model-select__chevron" size={15} aria-hidden="true" />
    </div>
  );
}
