"use client";

import { useState, useEffect } from "react";

export type PerformanceMode = "full" | "reduced" | "minimal";

/**
 * Detects whether the user's device can handle heavy animations.
 * Returns "full", "reduced", or "minimal" based on:
 * - prefers-reduced-motion media query
 * - Device memory (navigator.deviceMemory)
 * - Hardware concurrency (logical core count)
 * - Frame rate sampling (detects software rendering / no GPU accel)
 * - Mobile detection
 */
export function usePerformanceMode(): PerformanceMode {
  const [mode, setMode] = useState<PerformanceMode>("full");

  useEffect(() => {
    // 1. Respect prefers-reduced-motion immediately
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      setMode("minimal");
      return;
    }

    // 2. Check device signals
    const nav = navigator as any;
    const deviceMemory: number = nav.deviceMemory ?? 8; // default assume decent
    const hardwareConcurrency: number = nav.hardwareConcurrency ?? 4;
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

    // Low-end device heuristics
    if (deviceMemory <= 2 || hardwareConcurrency <= 2) {
      setMode("minimal");
      return;
    }
    if (deviceMemory <= 4 || hardwareConcurrency <= 4 || isMobile) {
      setMode("reduced");
      // Continue to frame rate check — might upgrade or confirm
    }

    // 3. Frame rate sampling to detect software rendering / disabled GPU accel
    let frameCount = 0;
    const startTime = performance.now();
    let rafId: number;
    const sampleDuration = 500; // ms

    const countFrame = () => {
      frameCount++;
      const elapsed = performance.now() - startTime;
      if (elapsed >= sampleDuration) {
        const fps = (frameCount / elapsed) * 1000;
        // Below ~30fps strongly suggests software rendering or very weak GPU
        if (fps < 30) {
          setMode("minimal");
        } else if (fps < 50) {
          setMode((prev) => (prev === "minimal" ? "minimal" : "reduced"));
        }
        // If fps is fine and we haven't set reduced from device signals, keep "full"
        return;
      }
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    // Listen for changes to prefers-reduced-motion
    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMode("minimal");
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      cancelAnimationFrame(rafId);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  return mode;
}
