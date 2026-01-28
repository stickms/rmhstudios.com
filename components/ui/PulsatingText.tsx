"use client";

import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useCallback, useRef } from "react";

interface PulsatingTextProps {
  children: string;
  className?: string;
  rainbow?: boolean;
}

function PulsatingLetter({
  letter,
  rainbow,
}: {
  letter: string;
  rainbow?: boolean;
}) {
  const controls = useAnimationControls();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerPulse = useCallback(async () => {
    await controls.start({
      scale: 1.2,
      y: -8,
      transition: { duration: 0.15, ease: "easeOut" },
    });
    await controls.start({
      scale: 1,
      y: 0,
      transition: { duration: 0.15, ease: "easeIn" },
    });
  }, [controls]);

  useEffect(() => {
    const scheduleNextPulse = () => {
      // Random interval between 1-4 seconds
      const interval = 1000 + Math.random() * 3000;
      timeoutRef.current = setTimeout(() => {
        triggerPulse();
        scheduleNextPulse();
      }, interval);
    };

    // Random initial delay for each letter
    const initialDelay = Math.random() * 2000;
    timeoutRef.current = setTimeout(() => {
      triggerPulse();
      scheduleNextPulse();
    }, initialDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [triggerPulse]);

  if (letter === " ") {
    return <span className="inline-block w-[0.3em]">&nbsp;</span>;
  }

  return (
    <motion.span
      className={`inline-block ${rainbow ? "rainbow-text" : ""}`}
      animate={controls}
      initial={{ scale: 1, y: 0 }}
      whileHover={{ scale: 1.3, y: -10, transition: { duration: 0.1 } }}
    >
      {letter}
    </motion.span>
  );
}

export function PulsatingText({
  children,
  className = "",
  rainbow = false,
}: PulsatingTextProps) {
  const letters = children.split("");

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <PulsatingLetter
          key={index}
          letter={letter}
          rainbow={rainbow}
        />
      ))}
    </span>
  );
}
