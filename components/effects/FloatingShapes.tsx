"use client";

import { motion } from "framer-motion";

const shapes = [
  { type: "circle", size: 60, color: "var(--neon-pink)", x: "10%", y: "20%", delay: 0 },
  { type: "circle", size: 40, color: "var(--neon-cyan)", x: "85%", y: "15%", delay: 0.5 },
  { type: "square", size: 50, color: "var(--neon-yellow)", x: "75%", y: "70%", delay: 1 },
  { type: "triangle", size: 45, color: "var(--neon-purple)", x: "15%", y: "75%", delay: 1.5 },
  { type: "circle", size: 30, color: "var(--neon-green)", x: "50%", y: "10%", delay: 0.8 },
  { type: "square", size: 35, color: "var(--neon-orange)", x: "90%", y: "50%", delay: 1.2 },
  { type: "circle", size: 25, color: "var(--neon-pink)", x: "5%", y: "50%", delay: 0.3 },
  { type: "triangle", size: 55, color: "var(--neon-cyan)", x: "60%", y: "85%", delay: 0.7 },
];

export function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {shapes.map((shape, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: shape.x,
            top: shape.y,
            width: shape.size,
            height: shape.size,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            x: [0, 30, -30, 0],
            y: [0, -40, 20, 0],
          }}
          transition={{
            duration: 8,
            delay: shape.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {shape.type === "circle" && (
            <div
              className="w-full h-full rounded-full"
              style={{
                background: `radial-gradient(circle, ${shape.color} 0%, transparent 70%)`,
                boxShadow: `0 0 30px ${shape.color}`,
              }}
            />
          )}
          {shape.type === "square" && (
            <div
              className="w-full h-full rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${shape.color} 0%, transparent 70%)`,
                boxShadow: `0 0 30px ${shape.color}`,
              }}
            />
          )}
          {shape.type === "triangle" && (
            <div
              className="w-0 h-0"
              style={{
                borderLeft: `${shape.size / 2}px solid transparent`,
                borderRight: `${shape.size / 2}px solid transparent`,
                borderBottom: `${shape.size}px solid ${shape.color}`,
                filter: `drop-shadow(0 0 20px ${shape.color})`,
              }}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
