/**
 * GalleryCarousel — Grid display of gallery drawings with SVG stroke rendering.
 */
'use client';

import DrawingCard from './DrawingCard';
import type { MMStroke } from './DrawingCard';

interface GalleryDrawing {
  drawingId: string;
  label: string;
  strokes: MMStroke[];
  backgroundColor?: string;
}

interface GalleryCarouselProps {
  drawings: GalleryDrawing[];
}

export default function GalleryCarousel({ drawings }: GalleryCarouselProps) {
  if (drawings.length === 0) {
    return (
      <p className="text-sm text-(--rmhbox-text-muted)">No drawings to display.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg">
      {drawings.map((drawing) => (
        <DrawingCard
          key={drawing.drawingId}
          strokes={drawing.strokes}
          backgroundColor={drawing.backgroundColor}
          label={drawing.label}
        />
      ))}
    </div>
  );
}
