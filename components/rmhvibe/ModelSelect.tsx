/**
 * ModelSelect — a custom, fully-styled dropdown to pick the generation model.
 *
 * Replaces the native <select> (whose option list can't be themed) with a button
 * + popover that matches the vibe UI. Lists every model grouped by provider (Kimi,
 * DeepSeek), each tagged with a quality/speed hint. Maps to the `VibeModel` the
 * server understands. Used on the homepage and in the customize panel.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = VIBE_MODEL_META[value];

  function select(model: VibeModel) {
    onChange(model);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`vibe-model-select ${className}`}>
      <button
        type="button"
        className="vibe-model-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Generation model"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="vibe-model-select__current">{current.label}</span>
        <ChevronDown
          className={`vibe-model-select__chevron ${open ? 'is-open' : ''}`}
          size={15}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="vibe-model-select__menu" role="listbox" aria-label="Generation model">
          {VIBE_PROVIDER_ORDER.map((provider) => (
            <div key={provider} className="vibe-model-select__group">
              <div className="vibe-model-select__group-label">{VIBE_PROVIDER_LABELS[provider]}</div>
              {VIBE_MODELS.filter((m) => VIBE_MODEL_META[m].provider === provider).map((m) => {
                const meta = VIBE_MODEL_META[m];
                const active = m === value;
                return (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`vibe-model-select__option ${active ? 'is-active' : ''}`}
                    onClick={() => select(m)}
                  >
                    <span className="vibe-model-select__option-label">{meta.label}</span>
                    <span className="vibe-model-select__option-hint">{meta.hint}</span>
                    {active && <Check className="vibe-model-select__check" size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
