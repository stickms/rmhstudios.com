/**
 * Canvas icon — draws lucide icon geometry (the same icon set the DOM UI
 * used) as Konva paths. lucide-react components can't render to canvas, so
 * this takes the icon's node data (`import { arrowLeft } from "lucide"` once
 * that package lands; until then pass path data directly).
 */

import { Group, Path, Circle, Line, Rect as KRect } from "react-konva";
import { Box } from "../runtime/layout/LayoutTree";
import { resolveColor, type LayoutRect } from "../runtime/layout/LayoutTree";
import { useTheme } from "../theme/useTheme";
import type { TokenColor } from "../runtime/tw";
import { useRef } from "react";
import type Konva from "konva";

/** lucide IconNode shape: [tag, attrs][] on a 24×24 grid. */
export type IconNode = ReadonlyArray<readonly [string, Record<string, string | number>]>;

export interface IconProps {
  node: IconNode;
  size?: number;
  color?: TokenColor | string;
  strokeWidth?: number;
  name?: string;
}

export function Icon({ node, size = 20, color, strokeWidth = 2, name }: IconProps) {
  const tokens = useTheme();
  const groupRef = useRef<Konva.Group | null>(null);
  const stroke =
    typeof color === "string"
      ? color
      : (resolveColor(tokens, color) ?? tokens.text);
  const scale = size / 24;

  return (
    <Box
      name={name ?? "icon"}
      style={{ layout: { width: size, height: size, flexShrink: 0 }, paint: {}, text: {} }}
      onLayout={(rect: LayoutRect) => {
        groupRef.current?.scale({ x: scale, y: scale });
        void rect;
      }}
    >
      <Group ref={groupRef} scaleX={scale} scaleY={scale} listening={false}>
        {node.map(([tag, attrs], i) => {
          const common = {
            key: i,
            stroke,
            strokeWidth,
            lineCap: "round" as const,
            lineJoin: "round" as const,
            listening: false,
          };
          switch (tag) {
            case "path":
              return <Path {...common} data={String(attrs.d)} />;
            case "circle":
              return (
                <Circle {...common} x={Number(attrs.cx)} y={Number(attrs.cy)} radius={Number(attrs.r)} />
              );
            case "line":
              return (
                <Line
                  {...common}
                  points={[Number(attrs.x1), Number(attrs.y1), Number(attrs.x2), Number(attrs.y2)]}
                />
              );
            case "rect":
              return (
                <KRect
                  {...common}
                  x={Number(attrs.x)}
                  y={Number(attrs.y)}
                  width={Number(attrs.width)}
                  height={Number(attrs.height)}
                  cornerRadius={attrs.rx ? Number(attrs.rx) : 0}
                />
              );
            case "polyline":
            case "polygon":
              return (
                <Line
                  {...common}
                  points={String(attrs.points)
                    .trim()
                    .split(/[\s,]+/)
                    .map(Number)}
                  closed={tag === "polygon"}
                />
              );
            default:
              return null;
          }
        })}
      </Group>
    </Box>
  );
}
