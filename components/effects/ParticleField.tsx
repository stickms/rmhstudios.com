"use client";

import { useEffect, useRef } from "react";
import { useMousePosition } from "@/contexts/MouseContext";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

const COLORS = [
  "#ff00ff", // pink
  "#00ffff", // cyan
  "#ffff00", // yellow
  "#00ff00", // green
  "#9900ff", // purple
  "#ff6600", // orange
];

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);
  const { mouseX, mouseY } = useMousePosition();
  const perfMode = usePerformanceMode();

  // Sync motion values to ref for use in animation loop
  useEffect(() => {
    const unsubX = mouseX.on("change", (x) => {
      mouseRef.current.x = x;
    });
    const unsubY = mouseY.on("change", (y) => {
      mouseRef.current.y = y;
    });
    return () => {
      unsubX();
      unsubY();
    };
  }, [mouseX, mouseY]);

  // Pause when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    // In minimal mode, don't render particles at all
    if (perfMode === "minimal") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let isMobile = window.innerWidth < 768;
    const isReduced = perfMode === "reduced";

    const resize = () => {
      // Use lower resolution canvas for better perf
      const dpr = isReduced || isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      isMobile = window.innerWidth < 768;
    };
    resize();
    window.addEventListener("resize", resize);

    // Particle count scales with performance mode
    const particleCount = isReduced ? 20 : isMobile ? 30 : 50;
    particlesRef.current = [];
    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push(createParticle(window.innerWidth, window.innerHeight));
    }

    function createParticle(width: number, height: number): Particle {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 3 + 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 100,
      };
    }

    // Throttle loop: target 30fps in reduced mode, ~60fps in full
    let lastFrameTime = 0;
    const frameInterval = isReduced ? 1000 / 30 : 0;

    function animate(timestamp: number) {
      if (!canvas || !ctx) return;

      // Skip frames when tab hidden
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Throttle in reduced mode
      if (frameInterval > 0 && timestamp - lastFrameTime < frameInterval) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = timestamp;

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.fillStyle = "rgba(10, 10, 10, 0.1)";
      ctx.fillRect(0, 0, w, h);

      const mouse = mouseRef.current;
      const particles = particlesRef.current;
      const skipConnections = isReduced;
      const connectionDist = isMobile ? 60 : 80;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse attraction (skip sqrt when far away using squared distance)
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 40000) { // 200^2
          const dist = Math.sqrt(distSq);
          const force = (200 - dist) / 200;
          p.vx += (dx / dist) * force * 0.5;
          p.vy += (dy / dist) * force * 0.5;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Wrap
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        p.life++;
        if (p.life > p.maxLife) {
          particles[i] = createParticle(w, h);
          continue;
        }

        // Draw particle — no shadowBlur (massive GPU cost)
        const alpha = 1 - p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw connections (skip in reduced mode, use squared dist to avoid sqrt)
        if (!skipConnections) {
          const connDistSq = connectionDist * connectionDist;
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const cdx = p.x - p2.x;
            const cdy = p.y - p2.y;
            const cDistSq = cdx * cdx + cdy * cdy;

            if (cDistSq < connDistSq) {
              const cDist = Math.sqrt(cDistSq);
              ctx.globalAlpha = (1 - cDist / connectionDist) * 0.2 * alpha;
              ctx.strokeStyle = p.color;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(animate);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [perfMode]);

  // Don't render canvas at all in minimal mode
  if (perfMode === "minimal") return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.5, willChange: "auto" }}
    />
  );
}
