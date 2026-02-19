"use client";

import { useState, useEffect } from "react";
import type { DialogueData } from "@/lib/house-always-wins/types";

interface DialogBoxProps {
  dialogue: DialogueData;
  onChoice: (action: string) => void;
  onAdvance: () => void;
}

export function DialogBox({ dialogue, onChoice, onAdvance }: DialogBoxProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const line = dialogue.lines[0];

  useEffect(() => {
    setSelectedIdx(0);
  }, [dialogue.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!line) return;

      if (line.choices && line.choices.length > 0) {
        if (e.code === "ArrowUp" || e.code === "KeyW") {
          setSelectedIdx((i) => Math.max(0, i - 1));
          e.preventDefault();
        } else if (e.code === "ArrowDown" || e.code === "KeyS") {
          setSelectedIdx((i) =>
            Math.min((line.choices?.length ?? 1) - 1, i + 1)
          );
          e.preventDefault();
        } else if (e.code === "KeyE" || e.code === "Enter") {
          const choice = line.choices?.[selectedIdx];
          if (choice) onChoice(choice.action);
          e.preventDefault();
        }
      } else {
        if (e.code === "KeyE" || e.code === "Enter" || e.code === "Space") {
          onAdvance();
          e.preventDefault();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line, selectedIdx, onChoice, onAdvance]);

  if (!line) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[600px] pointer-events-auto">
      <div className="bg-[rgba(10,10,10,0.94)] border border-[#2a2520] rounded-lg px-5 py-4 shadow-2xl">
        {/* Speaker */}
        <div className="text-[#d4a054] text-xs font-mono tracking-[0.2em] uppercase mb-2">
          {line.speaker}
        </div>

        {/* Text */}
        <div className="text-[#c8b89a] text-sm leading-relaxed mb-3 font-light">
          {line.text}
        </div>

        {/* Choices */}
        {line.choices && line.choices.length > 0 ? (
          <div className="space-y-1 mt-3 border-t border-[#2a2520] pt-3">
            {line.choices.map((choice, i) => (
              <button
                key={choice.action}
                onClick={() => onChoice(choice.action)}
                className={`block w-full text-left px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                  i === selectedIdx
                    ? "text-[#d4a054] bg-[#d4a054]/10"
                    : "text-[#8b6914] hover:text-[#d4a054]"
                }`}
              >
                {i === selectedIdx ? "▸ " : "  "}
                {choice.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[#555] text-xs font-mono mt-2">
            [E] Continue
          </div>
        )}
      </div>
    </div>
  );
}
