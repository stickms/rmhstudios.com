/**
 * ColorPalette — Horizontal strip of color swatches with selection ring.
 */
'use client';

interface ColorPaletteProps {
  colors: string[];
  selectedColor: string;
  onSelect: (color: string) => void;
}

export default function ColorPalette({ colors, selectedColor, onSelect }: ColorPaletteProps) {
  if (colors.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className={`w-8 h-8 rounded-full border-2 transition-transform ${
            selectedColor === color
              ? 'border-(--rmhbox-accent) scale-110 ring-2 ring-(--rmhbox-accent)/40'
              : 'border-(--rmhbox-border) hover:scale-105'
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}
