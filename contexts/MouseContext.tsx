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
  const isDocumentHidden = useRef(false);

  useEffect(() => {
    // Initialize to center of screen
    mouseX.set(window.innerWidth / 2);
    mouseY.set(window.innerHeight / 2);

    // Check if mobile/touch device
    const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    let lastTouchUpdate = 0;
    const TOUCH_THROTTLE_MS = 50; // Throttle touch updates to every 50ms

    // Track real mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      hasRealMouse.current = true;
      lastMouseMove.current = Date.now();
      setIsVirtual(false);
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    // Track touch as mouse position (throttled for performance)
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const now = Date.now();
        
        // Throttle touch updates on mobile
        if (isTouchDevice && now - lastTouchUpdate < TOUCH_THROTTLE_MS) {
          return;
        }
        
        lastTouchUpdate = now;
        hasRealMouse.current = true;
        lastMouseMove.current = now;
        setIsVirtual(false);
        mouseX.set(e.touches[0].clientX);
        mouseY.set(e.touches[0].clientY);
      }
    };

    // Handle visibility change - pause animations when tab is hidden
    const handleVisibilityChange = () => {
      isDocumentHidden.current = document.hidden;
    };

    // Virtual cursor animation - smooth flowing movement
    let time = Math.random() * 1000;
    const animate = () => {
      // Skip animation if document is hidden
      if (isDocumentHidden.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const now = Date.now();

      // If no real mouse activity for 3 seconds, use virtual cursor
      if (now - lastMouseMove.current > 3000 || !hasRealMouse.current) {
        setIsVirtual(true);
        time += 0.008; // Speed of movement

        // Create smooth, organic movement using multiple sine waves
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Combine multiple frequencies for organic feel
        const x =
          centerX +
          Math.sin(time * 0.7) * (window.innerWidth * 0.25) +
          Math.sin(time * 1.3) * (window.innerWidth * 0.1) +
          Math.sin(time * 2.1) * (window.innerWidth * 0.05);

        const y =
          centerY +
          Math.cos(time * 0.5) * (window.innerHeight * 0.2) +
          Math.cos(time * 1.1) * (window.innerHeight * 0.08) +
          Math.sin(time * 1.7) * (window.innerHeight * 0.04);

        mouseX.set(x);
        mouseY.set(y);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animationRef.current = requestAnimationFrame(animate);

    // Add event listeners
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Check for mouse capability
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mediaQuery.matches) {
      // No fine pointer (likely mobile/touch device)
      hasRealMouse.current = false;
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
