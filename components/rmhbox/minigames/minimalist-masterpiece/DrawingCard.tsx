/**
 * DrawingCard — Single drawing display using SVG stroke rendering.
 *
 * Renders an array of strokes as SVG paths on a fixed-size canvas.
 * Used by GalleryCarousel and AuctionPanel.
 */
'use client';

interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface MMStroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  timestamp: number;
}

interface DrawingCardProps {
  strokes: MMStroke[];
  label?: string;
  className?: string;
}

function strokeToPath(stroke: MMStroke): string {
  if (stroke.points.length === 0) return '';
  const [first, ...rest] = stroke.points;
  let d = `M ${first.x} ${first.y}`;
  for (const pt of rest) {
    d += ` L ${pt.x} ${pt.y}`;
  }
  return d;
}

export default function DrawingCard({ strokes, label, className = '' }: DrawingCardProps) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="w-48 h-48 rounded-lg border border-(--rmhbox-border) bg-white overflow-hidden">
        <svg viewBox="0 0 300 300" className="w-full h-full">
          {strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={strokeToPath(stroke)}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </svg>
      </div>
      {label && (
        <span className="text-xs text-(--rmhbox-text-muted)">{label}</span>
      )}
    </div>
  );
}
