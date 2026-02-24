'use client';

import { useState, useEffect, useRef } from 'react';
import type { FileMeta } from './utils';

interface QuickOpenPanelProps {
  files: FileMeta[];
  onOpen: (file: FileMeta) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, text: string): { matches: boolean; indices: number[] } {
  if (!query) return { matches: true, indices: [] };
  const lQuery = query.toLowerCase();
  const lText = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < lText.length && qi < lQuery.length; i++) {
    if (lText[i] === lQuery[qi]) {
      indices.push(i);
      qi++;
    }
  }
  return { matches: qi === lQuery.length, indices };
}

function fuzzyScore(query: string, text: string, indices: number[]): number {
  if (!query) return 0;
  let score = 0;
  // Consecutive matches score higher
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) score += 2;
  }
  // Matches at start of path segments (after / or start) score higher
  for (const idx of indices) {
    if (idx === 0 || text[idx - 1] === '/') score += 3;
  }
  // Prefer shorter paths (less "distance" to the query)
  score -= text.length * 0.01;
  return score;
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indexSet = new Set(indices);
  // Split path into directory and filename for better display
  const lastSlash = text.lastIndexOf('/');
  const dir = lastSlash >= 0 ? text.slice(0, lastSlash + 1) : '';
  const name = lastSlash >= 0 ? text.slice(lastSlash + 1) : text;
  const dirOffset = 0;
  const nameOffset = lastSlash + 1;

  return (
    <span className="flex items-center gap-1 min-w-0">
      {dir && (
        <span className="text-[#858585] text-xs truncate shrink-0 max-w-[50%]">
          {dir.split('').map((char, i) =>
            indexSet.has(dirOffset + i)
              ? <span key={i} className="text-[#4fc1ff] font-semibold">{char}</span>
              : <span key={i}>{char}</span>
          )}
        </span>
      )}
      <span className="text-white text-sm truncate">
        {name.split('').map((char, i) =>
          indexSet.has(nameOffset + i)
            ? <span key={i} className="text-[#4fc1ff] font-semibold">{char}</span>
            : <span key={i}>{char}</span>
        )}
      </span>
    </span>
  );
}

export default function QuickOpenPanel({ files, onOpen, onClose }: QuickOpenPanelProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = files
    .map(file => {
      const { matches, indices } = fuzzyMatch(query, file.path);
      return { file, matches, indices, score: fuzzyScore(query, file.path, indices) };
    })
    .filter(r => r.matches)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = results[selectedIndex];
      if (item) { onOpen(item.file); onClose(); }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        className="absolute left-1/2 -translate-x-1/2 top-10 w-full max-w-lg bg-[#252526] border border-[#454545] shadow-2xl rounded overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[#454545] px-3">
          <svg className="w-3.5 h-3.5 text-[#858585] shrink-0 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to file…"
            className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder-[#858585] focus:outline-none"
          />
          <span className="text-[10px] text-[#858585] ml-2 shrink-0">ESC to close</span>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto">
          {files.length === 0 && (
            <div className="px-4 py-3 text-xs text-[#858585]">No files in this project</div>
          )}
          {files.length > 0 && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-[#858585]">No files match &ldquo;{query}&rdquo;</div>
          )}
          {results.map(({ file, indices }, i) => (
            <button
              key={file.id}
              className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
                i === selectedIndex ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
              }`}
              onMouseDown={() => { onOpen(file); onClose(); }}
            >
              <HighlightedText text={file.path} indices={indices} />
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div className="border-t border-[#454545] px-4 py-1.5 flex items-center gap-3 text-[10px] text-[#858585]">
            <span><kbd className="bg-[#3c3c3c] px-1 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="bg-[#3c3c3c] px-1 rounded">↵</kbd> open</span>
          </div>
        )}
      </div>
    </div>
  );
}
