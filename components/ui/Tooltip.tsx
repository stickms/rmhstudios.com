"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function Tooltip({ content, children, className, delay = 0.2 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, []);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }
  };

  const handleMouseEnter = () => {
    updateCoords();
    timeoutId.current = setTimeout(() => {
      updateCoords(); // Final check
      setIsVisible(true);
    }, delay * 1000);
  };

  const handleMouseLeave = () => {
    if (timeoutId.current) clearTimeout(timeoutId.current);
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible) return;
    
    const handleUpdate = () => updateCoords();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible]);

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && (
        <div 
            style={{ 
                position: 'fixed', 
                top: coords.top, 
                left: coords.left, 
                zIndex: 9999, 
                pointerEvents: 'none' 
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
                animate={{ opacity: 1, scale: 1, y: -8, x: "-50%" }}
                exit={{ opacity: 0, scale: 0.9, y: 0, x: "-50%" }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                }}
                className={cn(
                    "px-2 py-1 text-[10px] font-bold text-white whitespace-nowrap",
                    "bg-slate-900/95 backdrop-blur-md rounded-md shadow-lg border border-white/10",
                    className
                )}
            >
                {content}
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-slate-900/95" />
            </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {mounted && createPortal(tooltipContent, document.body)}
    </>
  );
}
