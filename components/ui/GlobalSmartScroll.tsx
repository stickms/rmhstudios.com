"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "home", label: "Our Games" },
  { id: "projects", label: "About Us" },
  { id: "about", label: "Testimonials" },
  { id: "testimonials", label: "Devlog" },
  { id: "blog", label: "Merch" },
  { id: "merch", label: "Contact" },
  { id: "contact", label: "Back to Top" },
];

export function GlobalSmartScroll() {
  const [targetId, setTargetId] = useState<string>("projects");
  const [activeSectionId, setActiveSectionId] = useState<string>("");
  const [label, setLabel] = useState<string>("Our Games");
  const [mode, setMode] = useState<"scroll" | "next" | "top">("next");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;
      const scrollBottom = scrollY + viewportHeight;

      // Check if we are at the very bottom of the page
      if (Math.ceil(scrollBottom) >= totalHeight - 50) {
        setTargetId("home");
        setLabel("Back to Top");
        setMode("top");
        return;
      }

      // Find current visible section
      let currentSectionIndex = 0;
      let currentSectionElement = document.getElementById(SECTIONS[0].id);

      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // If top of section is within viewport or above it, and bottom is below top of viewport
          if (rect.top < viewportHeight / 2 && rect.bottom > 0) {
            currentSectionIndex = i;
            currentSectionElement = el;
          }
        }
      }

      if (currentSectionElement) {
        setActiveSectionId(SECTIONS[currentSectionIndex].id);
        const rect = currentSectionElement.getBoundingClientRect();
        
        // If bottom of section is significantly below the viewport bottom, we can "Keep Scrolling"
        // Buffer of 100px to allow transition
        if (rect.bottom > viewportHeight + 100) {
          setMode("scroll");
          setLabel("Keep Scrolling");
          setTargetId(""); // Special handling for local scroll
        } else {
          // We are near bottom of section, target next section
          setMode("next");
          const nextIndex = currentSectionIndex + 1;
          if (nextIndex < SECTIONS.length) {
            setTargetId(SECTIONS[nextIndex].id);
            setLabel(SECTIONS[currentSectionIndex].label); // Label points to what's next
          } else {
            // Should be covered by totalHeight check, but fallback
            setTargetId("home");
            setLabel("Back to Top");
            setMode("top");
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Run once

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = () => {
    if (mode === "scroll") {
      const currentElement = document.getElementById(activeSectionId);
      if (currentElement) {
        const rect = currentElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        // Calculate distance to exactly the bottom of the section
        // We want to scroll until rect.bottom aligns with viewportHeight (rect.bottom - viewportHeight)
        const distanceToBottom = rect.bottom - viewportHeight;
        
        // Scroll max 70% of viewport, BUT clamp to the distance to bottom
        // Add a tiny buffer (e.g. 2px) to ensure we might cross the threshold slightly if needed, 
        // or just accept exact bottom alignment which triggers "next" mode on next scroll event check.
        const scrollAmount = Math.min(viewportHeight * 0.7, distanceToBottom);
        
        window.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else {
         // Fallback if element not found for some reason
        window.scrollBy({ top: window.innerHeight * 0.7, behavior: "smooth" });
      }
    } else {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <motion.button
            onClick={handleClick}
            className="group flex flex-col items-center gap-2 cursor-pointer pointer-events-auto"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={label}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs text-white/50 uppercase tracking-widest group-hover:text-white transition-colors select-none font-bold bg-black/50 px-2 py-1 rounded backdrop-blur-sm shadow-sm"
              >
                {label}
              </motion.span>
            </AnimatePresence>

            <motion.div
              className={`w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center transition-all duration-300 bg-black/20 backdrop-blur-sm group-hover:border-[var(--neon-cyan)] group-hover:shadow-[0_0_15px_var(--neon-cyan)]`}
              animate={
                mode === "top"
                  ? { y: [0, -5, 0] }
                  : { y: [0, 5, 0] }
              }
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-white/60 group-hover:text-white transition-colors ${mode === "top" ? "rotate-180" : ""}`}
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </motion.svg>
            </motion.div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
