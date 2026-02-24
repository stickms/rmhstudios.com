'use client';

import { useRef } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { FileMeta, ProjectMeta } from './utils';
import { getLanguage } from './utils';
import WelcomeScreen from './WelcomeScreen';
import Breadcrumb from './Breadcrumb';
import { useSettings } from './SettingsContext';
import { CUSTOM_THEMES } from './themes';

interface EditorAreaProps {
  file: FileMeta | null;
  content: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  onOpenRecentFile: (file: FileMeta) => void;
  activeProject: ProjectMeta | null;
  isLocal?: boolean;
  localDirName?: string;
}

export default function EditorArea({
  file, content, readOnly = false, onChange, onCursorChange,
  onOpenRecentFile, activeProject,
  isLocal, localDirName,
}: EditorAreaProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const { settings } = useSettings();

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;

    // Register all custom themes so they're available when selected
    for (const theme of CUSTOM_THEMES) {
      monaco.editor.defineTheme(theme.id, theme.data);
    }

    editor.onDidChangeCursorPosition(e => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    // Ctrl+Shift+P → Monaco command palette
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
      () => editor.getAction('editor.action.quickCommand')?.run()
    );

    // Ctrl+G → Go to line
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG,
      () => editor.getAction('editor.action.gotoLine')?.run()
    );
  };

  if (!file) {
    return (
      <WelcomeScreen
        activeProject={activeProject}
        onOpenFile={onOpenRecentFile}
      />
    );
  }

  const language = file.language ?? getLanguage(file.name);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Breadcrumb
        project={activeProject}
        file={file}
        isLocal={isLocal}
        localDirName={localDirName}
      />
      <div className="flex-1 min-h-0">
        <Editor
          key={file.id}
          height="100%"
          theme={settings.editorTheme}
          language={language}
          value={content}
          options={{
            readOnly,
            fontFamily: settings.fontFamily,
            fontSize: settings.fontSize,
            lineHeight: Math.round(settings.fontSize * 1.6),
            minimap: { enabled: settings.showMinimap },
            stickyScroll: { enabled: settings.stickyScroll },
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
    </div>
  );
}
