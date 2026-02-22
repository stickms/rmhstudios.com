'use client';

import { useRef, useEffect } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { FileMeta } from './utils';
import { getLanguage } from './utils';

interface EditorAreaProps {
  file: FileMeta | null;
  content: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export default function EditorArea({ file, content, readOnly = false, onChange, onCursorChange }: EditorAreaProps) {
  const monacoRef = useRef<Monaco | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editor.onDidChangeCursorPosition(e => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });
  };

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-[#858585] select-none gap-3">
        <div className="text-6xl opacity-20">⌨</div>
        <p className="text-sm">Open a file from the explorer to start editing</p>
      </div>
    );
  }

  const language = file.language ?? getLanguage(file.name);

  return (
    <div className="flex-1 min-h-0">
      <Editor
        key={file.id}
        height="100%"
        theme="vs-dark"
        language={language}
        value={content}
        options={{
          readOnly,
          fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'off',
          renderWhitespace: 'selection',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          padding: { top: 8, bottom: 8 },
        }}
        onMount={handleMount}
        onChange={value => onChange(value ?? '')}
      />
    </div>
  );
}
