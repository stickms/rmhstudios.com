"use client";

import { useEffect, useRef } from "react";
import { useMousePosition } from "@/contexts/MouseContext";

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
  const { mouseX, mouseY } = useMousePosition();

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

  // No changes to logic above this, just re-implementing useEffect content
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mobile detection without hook inside useEffect (since hook is top-level, we can check width here or pass it in)
    // We can rely on window.innerWidth in the resize checking, but for init we want to know too.
    let isMobile = window.innerWidth < 768;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      isMobile = window.innerWidth < 768;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    // OPTIMIZATION: Reduce particle count on mobile
    const particleCount = isMobile ? 30 : 80;
    particlesRef.current = []; // Clear existing
    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push(createParticle(canvas.width, canvas.height));
    }

    function createParticle(width: number, height: number): Particle {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 4 + 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 100,
      };
    }

    function animate() {
      if (!canvas || !ctx) return;
      
      // Skip animation when document is hidden for performance
      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.fillStyle = "rgba(10, 10, 10, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;

      particlesRef.current.forEach((p, i) => {
        // Mouse attraction/repulsion
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          const force = (200 - dist) / 200;
          p.vx += (dx / dist) * force * 0.5;
          p.vy += (dy / dist) * force * 0.5;
        }

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Friction
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Life cycle
        p.life++;
        if (p.life > p.maxLife) {
          particlesRef.current[i] = createParticle(canvas.width, canvas.height);
        }

        // Draw particle with glow
        const alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;

        // OPTIMIZATION: Disable expensive shadowBlur on mobile
        if (!isMobile) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.color;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        ctx.restore();

        // Draw connections
        // OPTIMIZATION: Reduce connection check distance on mobile
        const connectionDist = isMobile ? 60 : 100;
        
        particlesRef.current.forEach((p2, j) => {
          if (j <= i) return;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDist) {
            ctx.save();
            ctx.globalAlpha = (1 - dist / connectionDist) * 0.3 * alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  );
}
