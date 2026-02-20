"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { useMotionValue, MotionValue } from "framer-motion";

interface MouseContextType {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  isVirtual: boolean;
}

const MouseContext = createContext<MouseContextType | null>(null);

export function useMousePosition() {
  const context = useContext(MouseContext);
  if (!context) {
    throw new Error("useMousePosition must be used within a MouseProvider");
  }
  return context;
}

interface MouseProviderProps {
  children: ReactNode;
}

export function MouseProvider({ children }: MouseProviderProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [isVirtual, setIsVirtual] = useState(true);
  const hasRealMouse = useRef(false);
  const lastMouseMove = useRef(0);
  const animationRef = useRef<number | null>(null);
  const isTabVisible = useRef(true);

  useEffect(() => {
    // Initialize to center of screen
    mouseX.set(window.innerWidth / 2);
    mouseY.set(window.innerHeight / 2);

    // Track tab visibility — pause virtual cursor when hidden
    const handleVisibility = () => {
      isTabVisible.current = document.visibilityState === "visible";
      if (isTabVisible.current && !hasRealMouse.current) {
        // Restart animation when tab becomes visible
        startAnimation();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Track real mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      hasRealMouse.current = true;
      lastMouseMove.current = Date.now();
      setIsVirtual(false);
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);

      // Stop virtual cursor animation when real mouse is active
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    // Track touch as mouse position
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        hasRealMouse.current = true;
        lastMouseMove.current = Date.now();
        setIsVirtual(false);
        mouseX.set(e.touches[0].clientX);
        mouseY.set(e.touches[0].clientY);
      }
    };

    // Virtual cursor animation — only runs when no real mouse
    let time = Math.random() * 1000;
    const animate = () => {
      if (!isTabVisible.current) {
        // Don't schedule next frame when tab is hidden
        animationRef.current = null;
        return;
      }

      const now = Date.now();

      // If real mouse recently active, pause virtual cursor
      if (now - lastMouseMove.current < 3000 && hasRealMouse.current) {
        // Check again in a second instead of every frame
        animationRef.current = window.setTimeout(() => {
          animationRef.current = requestAnimationFrame(animate);
        }, 1000) as unknown as number;
        return;
      }

      setIsVirtual(true);
      time += 0.008;

      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Simplified: 2 sine waves instead of 3
      const x =
        centerX +
        Math.sin(time * 0.7) * (window.innerWidth * 0.25) +
        Math.sin(time * 1.3) * (window.innerWidth * 0.1);

      const y =
        centerY +
        Math.cos(time * 0.5) * (window.innerHeight * 0.2) +
        Math.cos(time * 1.1) * (window.innerHeight * 0.08);

      mouseX.set(x);
      mouseY.set(y);

      animationRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (animationRef.current) return;
      animationRef.current = requestAnimationFrame(animate);
    };

    // Check for mouse capability — if no fine pointer, start virtual cursor
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mediaQuery.matches) {
      hasRealMouse.current = false;
    }

    // Only start virtual cursor if no real mouse detected
    if (!hasRealMouse.current) {
      startAnimation();
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mouseX, mouseY]);

  return (
    <MouseContext.Provider value={{ mouseX, mouseY, isVirtual }}>
      {children}
    </MouseContext.Provider>
  );
}
