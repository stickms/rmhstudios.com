'use client';

import type { SlideElement, ShapeType } from './types';

interface Props {
  element: SlideElement;
}

export default function ShapeElement({ element }: Props) {
  const shapeType = (element.content || 'rectangle') as ShapeType;
  const fill = element.style.fill || '#f97316';
  const stroke = element.style.stroke || 'none';
  const strokeWidth = element.style.strokeWidth || 0;
  const borderRadius = element.style.borderRadius || 0;

  const renderShape = () => {
    switch (shapeType) {
      case 'rectangle':
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={100 - strokeWidth}
              height={100 - strokeWidth}
              rx={borderRadius}
              ry={borderRadius}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );

      case 'circle':
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <ellipse
              cx="50"
              cy="50"
              rx={50 - strokeWidth / 2}
              ry={50 - strokeWidth / 2}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );

      case 'triangle':
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points="50,2 98,98 2,98"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          </svg>
        );

      case 'arrow':
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
            <defs>
              <marker id={`arrowhead-${element.id}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={fill} />
              </marker>
            </defs>
            <line
              x1="5"
              y1="30"
              x2="85"
              y2="30"
              stroke={fill}
              strokeWidth={Math.max(strokeWidth, 3)}
              markerEnd={`url(#arrowhead-${element.id})`}
            />
          </svg>
        );

      case 'line':
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1="2"
              y1="50"
              x2="98"
              y2="50"
              stroke={fill}
              strokeWidth={Math.max(strokeWidth, 2)}
              strokeLinecap="round"
            />
          </svg>
        );

      case 'star': {
        // 5-pointed star
        const points: string[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 2) * -1 + (Math.PI / 5) * i;
          const r = i % 2 === 0 ? 48 : 20;
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle);
          points.push(`${x},${y}`);
        }
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points={points.join(' ')}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          </svg>
        );
      }

      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="0" y="0" width="100" height="100" fill={fill} />
          </svg>
        );
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', opacity: element.style.opacity !== undefined ? element.style.opacity : 1 }}>
      {renderShape()}
    </div>
  );
}
