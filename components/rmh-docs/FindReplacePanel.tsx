'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Replace, CaseSensitive } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface Props {
  editor: Editor;
  onClose: () => void;
}

export default function FindReplacePanel({ editor, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const findMatches = useCallback(() => {
    if (!searchTerm) {
      setTotalMatches(0);
      setCurrentIndex(0);
      return [];
    }

    const text = editor.getText();
    const search = matchCase ? searchTerm : searchTerm.toLowerCase();
    const content = matchCase ? text : text.toLowerCase();
    const matches: number[] = [];
    let pos = 0;

    while (pos < content.length) {
      const idx = content.indexOf(search, pos);
      if (idx === -1) break;
      matches.push(idx);
      pos = idx + 1;
    }

    setTotalMatches(matches.length);
    return matches;
  }, [editor, searchTerm, matchCase]);

  useEffect(() => {
    findMatches();
  }, [findMatches]);

  const navigateMatch = useCallback((direction: 'next' | 'prev') => {
    if (totalMatches === 0) return;

    let newIndex: number;
    if (direction === 'next') {
      newIndex = currentIndex < totalMatches - 1 ? currentIndex + 1 : 0;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : totalMatches - 1;
    }
    setCurrentIndex(newIndex);

    // Scroll to the match in the document
    if (!searchTerm) return;
    const text = editor.getText();
    const search = matchCase ? searchTerm : searchTerm.toLowerCase();
    const content = matchCase ? text : text.toLowerCase();
    const matches: number[] = [];
    let pos = 0;
    while (pos < content.length) {
      const idx = content.indexOf(search, pos);
      if (idx === -1) break;
      matches.push(idx);
      pos = idx + 1;
    }

    if (matches[newIndex] !== undefined) {
      // Use editor commands to select text at match position
      // TipTap positions include node delimiters, so we need to map text position to doc position
      let textOffset = 0;
      let found = false;
      editor.state.doc.descendants((node, nodePos) => {
        if (found) return false;
        if (node.isText && node.text) {
          const nodeStart = textOffset;
          const nodeEnd = textOffset + node.text.length;
          const matchStart = matches[newIndex];
          const matchEnd = matchStart + searchTerm.length;

          if (matchStart >= nodeStart && matchStart < nodeEnd) {
            const from = nodePos + (matchStart - nodeStart);
            const to = Math.min(nodePos + (matchEnd - nodeStart), nodePos + node.text.length);
            editor.chain().setTextSelection({ from, to }).scrollIntoView().run();
            found = true;
            return false;
          }
          textOffset += node.text.length;
        }
        return !found;
      });
    }
  }, [currentIndex, totalMatches, editor, searchTerm, matchCase]);

  const replaceOne = useCallback(() => {
    if (totalMatches === 0 || !searchTerm) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    const matchText = matchCase ? searchTerm : searchTerm.toLowerCase();
    const compareText = matchCase ? selectedText : selectedText.toLowerCase();

    if (compareText === matchText) {
      editor.chain().focus().insertContentAt({ from, to }, replaceTerm).run();
      findMatches();
    } else {
      navigateMatch('next');
    }
  }, [editor, searchTerm, replaceTerm, matchCase, totalMatches, findMatches, navigateMatch]);

  const replaceAll = useCallback(() => {
    if (totalMatches === 0 || !searchTerm) return;

    const text = editor.getHTML();
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const newHtml = text.replace(regex, replaceTerm);
    editor.commands.setContent(newHtml);
    findMatches();
  }, [editor, searchTerm, replaceTerm, matchCase, totalMatches, findMatches]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) navigateMatch('prev');
      else navigateMatch('next');
    }
  }, [onClose, navigateMatch]);

  return (
    <div className="docs-find-replace" onKeyDown={handleKeyDown}>
      {/* Search row */}
      <div className="flex items-center gap-2 flex-1">
        <input
          ref={searchRef}
          type="text"
          placeholder="Find..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentIndex(0); }}
          className="flex-1 min-w-[180px]"
        />
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--docs-text-subtle)', minWidth: '60px' }}>
          {totalMatches > 0 ? `${currentIndex + 1} of ${totalMatches}` : searchTerm ? 'No results' : ''}
        </span>
        <button
          onClick={() => setMatchCase(!matchCase)}
          className="docs-toolbar-btn"
          style={{ color: matchCase ? 'var(--docs-accent)' : undefined }}
          title="Match case"
        >
          <CaseSensitive size={16} />
        </button>
        <button onClick={() => navigateMatch('prev')} className="docs-toolbar-btn" title="Previous match">
          <ChevronUp size={16} />
        </button>
        <button onClick={() => navigateMatch('next')} className="docs-toolbar-btn" title="Next match">
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Replace toggle */}
      <button
        onClick={() => setShowReplace(!showReplace)}
        className="docs-toolbar-btn"
        title="Toggle replace"
        style={{ color: showReplace ? 'var(--docs-accent)' : undefined }}
      >
        <Replace size={16} />
      </button>

      {/* Replace row */}
      {showReplace && (
        <>
          <div className="w-px h-5" style={{ background: 'var(--docs-border)' }} />
          <input
            type="text"
            placeholder="Replace..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="min-w-[150px]"
          />
          <button
            onClick={replaceOne}
            className="docs-toolbar-btn text-xs px-2"
            title="Replace"
          >
            Replace
          </button>
          <button
            onClick={replaceAll}
            className="docs-toolbar-btn text-xs px-2"
            title="Replace all"
          >
            All
          </button>
        </>
      )}

      <button onClick={onClose} className="docs-toolbar-btn" title="Close (Esc)">
        <X size={16} />
      </button>
    </div>
  );
}
