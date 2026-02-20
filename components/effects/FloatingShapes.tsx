"use client";

import { usePerformanceMode } from "@/hooks/usePerformanceMode";

const shapes = [
  { type: "circle", size: 60, color: "var(--neon-pink)", x: "10%", y: "20%", delay: "0s" },
  { type: "circle", size: 40, color: "var(--neon-cyan)", x: "85%", y: "15%", delay: "0.5s" },
  { type: "square", size: 50, color: "var(--neon-yellow)", x: "75%", y: "70%", delay: "1s" },
  { type: "circle", size: 30, color: "var(--neon-green)", x: "50%", y: "10%", delay: "0.8s" },
];

export function FloatingShapes() {
  const perfMode = usePerformanceMode();

  // Skip entirely in minimal mode
  if (perfMode === "minimal") return null;

  // In reduced mode, show fewer shapes with simpler animation
  const visibleShapes = perfMode === "reduced" ? shapes.slice(0, 2) : shapes;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {visibleShapes.map((shape, i) => (
        <div
          key={i}
          className="absolute floating-shape"
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
            animationDelay: shape.delay,
          }}
        >
          {shape.type === "circle" && (
            <div
              className="w-full h-full rounded-full"
              style={{
                background: `radial-gradient(circle, ${shape.color} 0%, transparent 70%)`,
                opacity: 0.4,
              }}
            />
          )}
          {shape.type === "square" && (
            <div
              className="w-full h-full rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${shape.color} 0%, transparent 70%)`,
                opacity: 0.4,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
