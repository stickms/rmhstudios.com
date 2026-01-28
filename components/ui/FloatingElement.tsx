"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

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
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // BOUNCY spring config - low damping = more bounce!
  const springConfig = { damping: 12, stiffness: 200, mass: 0.8 };

  const x = useSpring(
    useTransform(mouseX, [-1, 1], [-intensity, intensity]),
    springConfig
  );
  const y = useSpring(
    useTransform(mouseY, [-1, 1], [-intensity, intensity]),
    springConfig
  );

  // Add rotation based on mouse position for extra energy
  const rotateZ = useSpring(
    useTransform(mouseX, [-1, 1], [-3, 3]),
    springConfig
  );
  const scale = useSpring(
    useTransform(mouseX, [-1, 0, 1], [0.98, 1, 0.98]),
    springConfig
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const normalizedX = (e.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX.set(normalizedX);
      mouseY.set(normalizedY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

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
