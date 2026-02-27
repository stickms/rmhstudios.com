/**
 * ColorPalette — Horizontal strip of color swatches with a
 * react-colorful HexColorPicker popover for custom colors.
 *
 * Used for both stroke color and background color selection
 * in Minimalist Masterpiece.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Pipette } from 'lucide-react';

interface ColorPaletteProps {
  colors: string[];
  selectedColor: string;
  onSelect: (color: string) => void;
  /** Swatch size class — defaults to 'w-8 h-8' */
  swatchSize?: string;
  /** Label to display before swatches */
  label?: string;
}

export default function ColorPalette({ colors, selectedColor, onSelect, swatchSize = 'w-8 h-8', label }: ColorPaletteProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Whether the current color is a custom (non-palette) color
  const isCustomColor = !colors.includes(selectedColor);
  // The picker circle should show the selected styling when picker is open or color is custom
  const pickerSelected = showPicker || isCustomColor;

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      {label && <span className="text-xs text-(--rmhbox-text-muted)">{label}</span>}
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => { onSelect(color); setShowPicker(false); }}
          className={`${swatchSize} rounded-full border-2 transition-transform ${
            selectedColor === color && !showPicker
              ? 'border-(--rmhbox-accent) scale-110 ring-2 ring-(--rmhbox-accent)/40'
              : 'border-(--rmhbox-border) hover:scale-105'
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
      {/* Custom color picker circle — aligned with swatches via inline-flex */}
      <div className="relative inline-flex items-center" ref={pickerRef}>
        <button
          className={`${swatchSize} rounded-full border-2 transition-transform flex items-center justify-center ${
            pickerSelected
              ? 'border-(--rmhbox-accent) scale-110 ring-2 ring-(--rmhbox-accent)/40'
              : 'border-(--rmhbox-border) hover:scale-105'
          }`}
          style={{ backgroundColor: selectedColor }}
          onClick={() => setShowPicker((v) => !v)}
          title="Custom color"
          aria-label="Custom color picker"
        >
          <Pipette size={14} className="text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
        </button>
        {showPicker && (
          <div className="absolute z-50 top-10 left-1/2 -translate-x-1/2 p-2 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) shadow-lg">
            <HexColorPicker color={selectedColor} onChange={onSelect} />
          </div>
        )}
      </div>
    </div>
  );
}
