/**
 * EventScreen.tsx — Signal Forge
 * ──────────────────────────────
 * Renders a narrative event with multiple choices. Events appear randomly
 * between floors and offer risk/reward trade-offs.
 */

'use client';

import React from 'react';

interface EventData {
  name: string;
  description: string;
  choices: { label: string; description: string }[];
}

interface Props {
  event: EventData;
  onResolve: (choiceIndex: number) => void;
}

export function EventScreen({ event, onResolve }: Props) {
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-yellow-500 p-8 rounded-lg max-w-lg w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-yellow-400 mb-2">{event.name}</h2>
        <p className="text-slate-300 mb-6">{event.description}</p>
        <div className="space-y-3">
          {event.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => onResolve(i)}
              className="w-full text-left p-4 rounded border border-yellow-600 hover:bg-yellow-900 hover:bg-opacity-30 transition"
            >
              <div className="font-bold text-yellow-300">{choice.label}</div>
              <div className="text-sm text-slate-400 mt-1">{choice.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
