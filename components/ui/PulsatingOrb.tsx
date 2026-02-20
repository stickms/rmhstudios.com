"use client";

import { usePerformanceMode } from "@/hooks/usePerformanceMode";

interface PulsatingOrbProps {
  className?: string;
  color?: "pink" | "cyan" | "purple" | "yellow";
  size?: "sm" | "md" | "lg";
}

const colorMap = {
  pink: "var(--neon-pink)",
  cyan: "var(--neon-cyan)",
  purple: "var(--neon-purple)",
  yellow: "var(--neon-yellow)",
};

const sizeMap = {
  sm: "w-32 h-32",
  md: "w-48 h-48",
  lg: "w-64 h-64",
};

// Reduced sizes for perf modes — less GPU composite area
const reducedSizeMap = {
  sm: "w-20 h-20",
  md: "w-32 h-32",
  lg: "w-40 h-40",
};

export function PulsatingOrb({
  className = "",
  color = "pink",
  size = "md",
}: PulsatingOrbProps) {
  const perfMode = usePerformanceMode();

  // Skip entirely in minimal mode
  if (perfMode === "minimal") return null;

  const orbColor = colorMap[color];
  const orbSize = perfMode === "reduced" ? reducedSizeMap[size] : sizeMap[size];
  // Use smaller blur in reduced mode
  const blurClass = perfMode === "reduced" ? "blur-xl" : "blur-3xl";

  return (
    <div
      className={`${orbSize} rounded-full ${blurClass} pointer-events-none pulsating-orb ${className}`}
      style={{
        background: `radial-gradient(circle, ${orbColor} 0%, transparent 70%)`,
      }}
    />
  );
}
