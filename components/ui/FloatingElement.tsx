"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { useMousePosition } from "@/contexts/MouseContext";
import { useWindowSize } from "@/hooks/useWindowSize";
import { SPRING_CONFIGS } from "@/lib/animations/constants";

interface FloatingElementProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export function FloatingElement({
  children,
  className = "",
  intensity = 20,
}: FloatingElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { mouseX: globalMouseX, mouseY: globalMouseY } = useMousePosition();
  const windowSize = useWindowSize();

  // Transform absolute mouse position to normalized -1 to 1 range
  const normalizedX = useTransform(globalMouseX, [0, windowSize.width], [-1, 1]);
  const normalizedY = useTransform(globalMouseY, [0, windowSize.height], [-1, 1]);

  const x = useSpring(
    useTransform(normalizedX, [-1, 1], [-intensity, intensity]),
    SPRING_CONFIGS.bouncy
  );
  const y = useSpring(
    useTransform(normalizedY, [-1, 1], [-intensity, intensity]),
    SPRING_CONFIGS.bouncy
  );

  // Add rotation based on mouse position for extra energy
  const rotateZ = useSpring(
    useTransform(normalizedX, [-1, 1], [-3, 3]),
    SPRING_CONFIGS.bouncy
  );
  const scale = useSpring(
    useTransform(normalizedX, [-1, 0, 1], [0.98, 1, 0.98]),
    SPRING_CONFIGS.bouncy
  );

  return (
    <motion.div
      ref={ref}
      style={{ x, y, rotateZ, scale }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
