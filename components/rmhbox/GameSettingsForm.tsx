/**
 * GameSettingsForm — Shared settings pane for per-minigame configuration.
 *
 * Renders a list of setting rows based on a GameSettingsSchema.
 * Each setting type maps to an appropriate control:
 *   boolean  → toggle switch
 *   integer  → stepper (+/−) when range ≤20, otherwise slider
 *   float    → slider
 *   select   → dropdown
 *
 * Used by both GameSettingsModal (lobby pre-config) and
 * GameSettingsPhase (post-vote phase).
 *
 * Reference: docs/rmhbox/design-spec/core.md §12A.7
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Minus, Plus } from 'lucide-react';
import type { GameSettingDef, GameSettingsSchema, GameSettingValues } from '@/lib/rmhbox/types';

// ─── Props ───────────────────────────────────────────────────────

export interface GameSettingsFormProps {
  schema: GameSettingsSchema;
  values: GameSettingValues;
  /** If true the host can edit; otherwise all controls are disabled / read-only. */
  editable: boolean;
  /** Called when the host changes a single setting. */
  onSettingChange?: (key: string, value: boolean | number | string) => void;
  /** Called when the host resets all settings to defaults. */
  onReset?: () => void;
}

// ─── Individual setting renderers ────────────────────────────────

function BooleanSetting({
  value,
  editable,
  onChange,
}: {
  def: GameSettingDef;
  value: boolean;
  editable: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={!editable}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        value ? 'bg-(--rmhbox-accent)' : 'bg-(--rmhbox-border)'
      } ${!editable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function IntegerSetting({
  def,
  value,
  editable,
  onChange,
}: {
  def: GameSettingDef;
  value: number;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const step = def.step ?? 1;
  const range = max - min;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when editing starts
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = useCallback(() => {
    if (!editable) return;
    setDraft(String(value));
    setEditing(true);
  }, [editable, value]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed)) return; // Cancel on invalid input
    // Snap to nearest step, then clamp
    const snapped = Math.round((parsed - min) / step) * step + min;
    onChange(Math.max(min, Math.min(max, snapped)));
  }, [draft, min, max, step, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') setEditing(false);
    },
    [commitEdit],
  );

  // Use stepper when the total number of discrete values is small (≤20)
  if (range / step <= 20) {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={!editable || value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-6 w-6 items-center justify-center rounded bg-(--rmhbox-bg) border border-(--rmhbox-border) text-(--rmhbox-text) disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-colors"
        >
          <Minus className="h-3 w-3" />
        </button>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-12 rounded bg-(--rmhbox-bg) border border-(--rmhbox-accent) text-center text-sm font-semibold text-(--rmhbox-text) outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span
            onClick={startEditing}
            className={`min-w-[2ch] text-center text-sm font-semibold text-(--rmhbox-text) ${editable ? 'cursor-pointer hover:text-(--rmhbox-accent) transition-colors' : ''}`}
          >
            {value}
          </span>
        )}
        <button
          disabled={!editable || value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="flex h-6 w-6 items-center justify-center rounded bg-(--rmhbox-bg) border border-(--rmhbox-border) text-(--rmhbox-text) disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Larger range → slider
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-(--rmhbox-accent) disabled:opacity-60"
      />
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-14 rounded bg-(--rmhbox-bg) border border-(--rmhbox-accent) text-right text-sm font-semibold text-(--rmhbox-text) outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <span
          onClick={startEditing}
          className={`min-w-[2.5ch] text-right text-sm font-semibold text-(--rmhbox-text) ${editable ? 'cursor-pointer hover:text-(--rmhbox-accent) transition-colors' : ''}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function FloatSetting({
  def,
  value,
  editable,
  onChange,
}: {
  def: GameSettingDef;
  value: number;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  const step = def.step ?? 0.1;
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : 1;

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-(--rmhbox-accent) disabled:opacity-60"
      />
      <span className="min-w-[3ch] text-right text-sm font-semibold text-(--rmhbox-text)">
        {value.toFixed(decimals)}
      </span>
    </div>
  );
}

function SelectSetting({
  def,
  value,
  editable,
  onChange,
}: {
  def: GameSettingDef;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  const options = def.options ?? [];
  return (
    <select
      value={value}
      disabled={!editable}
      onChange={(e) => onChange(e.target.value)}
      className="rounded bg-(--rmhbox-bg) px-2 py-1 text-sm text-(--rmhbox-text) border border-(--rmhbox-border) disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </option>
      ))}
    </select>
  );
}

// ─── Setting Row ─────────────────────────────────────────────────

function SettingRow({
  def,
  value,
  editable,
  onChange,
}: {
  def: GameSettingDef;
  value: boolean | number | string;
  editable: boolean;
  onChange: (key: string, v: boolean | number | string) => void;
}) {
  const handleChange = (v: boolean | number | string) => onChange(def.key, v);

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-(--rmhbox-text)">{def.label}</div>
        <div className="text-xs text-(--rmhbox-text-muted) leading-tight">{def.description}</div>
      </div>
      <div className="shrink-0">
        {def.type === 'boolean' && (
          <BooleanSetting def={def} value={value as boolean} editable={editable} onChange={handleChange} />
        )}
        {def.type === 'integer' && (
          <IntegerSetting def={def} value={value as number} editable={editable} onChange={handleChange} />
        )}
        {def.type === 'float' && (
          <FloatSetting def={def} value={value as number} editable={editable} onChange={handleChange} />
        )}
        {def.type === 'select' && (
          <SelectSetting def={def} value={value as string} editable={editable} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}

// ─── GameSettingsForm ────────────────────────────────────────────

export default function GameSettingsForm({
  schema,
  values,
  editable,
  onSettingChange,
  onReset,
}: GameSettingsFormProps) {
  const { t } = useTranslation("c-rmhbox");
  return (
    <div className="space-y-1 divide-y divide-(--rmhbox-border)">
      {schema.map((def) => (
        <SettingRow
          key={def.key}
          def={def}
          value={values[def.key] ?? def.default}
          editable={editable}
          onChange={(k, v) => onSettingChange?.(k, v)}
        />
      ))}

      {/* Reset button — host only */}
      {editable && onReset && (
        <div className="pt-3">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs font-medium text-(--rmhbox-text-muted) hover:text-(--rmhbox-text) transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            {t("reset-to-defaults", { defaultValue: "Reset to Defaults" })}
          </button>
        </div>
      )}
    </div>
  );
}
