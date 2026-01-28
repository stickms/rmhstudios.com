"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useMousePosition } from "@/contexts/MouseContext";

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
  const [windowSize, setWindowSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Transform absolute mouse position to normalized -1 to 1 range
  const normalizedX = useTransform(globalMouseX, [0, windowSize.width], [-1, 1]);
  const normalizedY = useTransform(globalMouseY, [0, windowSize.height], [-1, 1]);

  // BOUNCY spring config - low damping = more bounce!
  const springConfig = { damping: 12, stiffness: 200, mass: 0.8 };

  const x = useSpring(
    useTransform(normalizedX, [-1, 1], [-intensity, intensity]),
    springConfig
  );
  const y = useSpring(
    useTransform(normalizedY, [-1, 1], [-intensity, intensity]),
    springConfig
  );

  // Add rotation based on mouse position for extra energy
  const rotateZ = useSpring(
    useTransform(normalizedX, [-1, 1], [-3, 3]),
    springConfig
  );
  const scale = useSpring(
    useTransform(normalizedX, [-1, 0, 1], [0.98, 1, 0.98]),
    springConfig
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
