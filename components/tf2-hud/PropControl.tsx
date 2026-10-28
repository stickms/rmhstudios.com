/**
 * The control for one `.res` property, chosen by its name: a tick-box for flags, the font and colour
 * pickers, the scheme-border list, and a text box for everything else. The inspector edits one panel
 * with it and the Blocks panel edits a block's shared values with it, so a property looks and behaves
 * the same wherever it is edited.
 */
'use client';

import type { InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ALIGNMENTS } from '@/lib/tf2-hud/kv/completions';
import { borderOf, type Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { BorderSwatch } from './border-swatch';
import { ColorField } from './ColorPicker';
import { FontField } from './FontPicker';
import { SelectField, TextField, Toggle } from './ui';

export const BOOL_KEYS = new Set(['visible', 'enabled', 'wrap', 'centerwrap', 'scaleimage']);

export type PropKind = 'bool' | 'font' | 'align' | 'border' | 'color' | 'bgtype' | 'text';

export function propKind(key: string): PropKind {
  const k = key.toLowerCase();
  if (BOOL_KEYS.has(k)) return 'bool';
  if (k === 'font') return 'font';
  if (k === 'textalignment') return 'align';
  if (k === 'border') return 'border';
  if (k.includes('color')) return 'color';
  if (k === 'paintbackgroundtype') return 'bgtype';
  return 'text';
}

export function PropControl({
  propKey,
  value,
  onChange,
  scheme,
  screenH,
  onCreateSchemeColor,
  textProps,
  placeholder,
}: {
  propKey: string;
  value: string;
  onChange: (value: string) => void;
  scheme: Scheme;
  screenH: number;
  onCreateSchemeColor?: (name: string, literal: string) => void;
  /** Extra props for the plain text box (the inspector's layout fields add focus guides). */
  textProps?: InputHTMLAttributes<HTMLInputElement>;
  placeholder?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const key = propKey;
  switch (propKind(key)) {
    case 'bool':
      return (
        <Toggle
          label={key}
          checked={value !== '' && value !== '0'}
          onChange={(v) => onChange(v ? '1' : '0')}
        />
      );
    case 'font':
      return (
        <FontField
          value={value}
          onChange={onChange}
          scheme={scheme}
          screenH={screenH}
          label={key}
        />
      );
    case 'align':
      return (
        <SelectField
          aria-label={key}
          value={value || 'west'}
          onChange={(e) => onChange(e.target.value)}
        >
          {ALIGNMENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectField>
      );
    case 'border': {
      const def = borderOf(scheme, value);
      return (
        <div className="min-w-0 space-y-1">
          <SelectField
            aria-label={key}
            value={value.toLowerCase()}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t('none', { defaultValue: '(none)' })}</option>
            {value && !def ? <option value={value.toLowerCase()}>{value} ⚠</option> : null}
            {[...scheme.borders.keys()].sort().map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectField>
          {def ? <BorderSwatch border={def} scheme={scheme} /> : null}
        </div>
      );
    }
    case 'color':
      return (
        <ColorField
          value={value}
          onChange={onChange}
          scheme={scheme}
          label={key}
          onCreateSchemeColor={onCreateSchemeColor}
        />
      );
    case 'bgtype':
      return (
        <SelectField
          aria-label={key}
          value={value || '0'}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="0">{t('bg-none', { defaultValue: '0 — none' })}</option>
          <option value="1">{t('bg-filled', { defaultValue: '1 — filled' })}</option>
          <option value="2">{t('bg-rounded', { defaultValue: '2 — rounded' })}</option>
        </SelectField>
      );
    default:
      return (
        <TextField
          aria-label={key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          {...textProps}
        />
      );
  }
}
