'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useDocsStore } from '@/lib/store/useDocsStore';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import { createDocsExtensions } from '@/lib/rmh-docs/extensions';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import DocsToolbar from './DocsToolbar';
import DocsMenuBar from './DocsMenuBar';
import DocsSidebar from './DocsSidebar';
import FindReplacePanel from './FindReplacePanel';
import { DOCS_ACCENT } from './types';
import type { DocsDocument } from './types';
import TurndownService from 'turndown';

interface Props {
  document: DocsDocument;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
}

export default function DocsEditor({ document, onBack, onRename, onToggleFavorite }: Props) {
  const { zoom, sidebarVisible, findReplaceVisible, readingMode, toggleSidebar, toggleFindReplace, toggleReadingMode, setFindReplaceVisible } = useDocsStore();
  const { getDocument, updateDocument } = useDocumentStore();

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial content from store
  const storedDoc = getDocument(document.id);
  const initialContent = storedDoc?.content || '';

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createDocsExtensions(),
    content: initialContent ? JSON.parse(initialContent) : undefined,
    editorProps: {
      attributes: { class: 'docs-editor' },
    },
    onUpdate: ({ editor: ed }) => {
      // Debounced autosave
      setSaveStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = JSON.stringify(ed.getJSON());
        updateDocument(document.id, { content: json });
        setSaveStatus('saved');
      }, 500);
    },
  });

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'f') { e.preventDefault(); toggleFindReplace(); }
      if (meta && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
      if (meta && e.shiftKey && e.key === 'r') { e.preventDefault(); toggleReadingMode(); }
      if (e.key === 'Escape' && findReplaceVisible) { setFindReplaceVisible(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [findReplaceVisible, toggleFindReplace, toggleSidebar, toggleReadingMode, setFindReplaceVisible]);

  // Export handlers
  const handleExportPDF = useCallback(() => {
    if (!editor) return;
    const content = editor.getHTML();
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${document.title}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; line-height: 1.7; color: #0F172A; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
            h2 { font-size: 1.5em; font-weight: 700; margin: 0.8em 0 0.4em; }
            h3 { font-size: 1.25em; font-weight: 600; margin: 0.7em 0 0.3em; }
            code { background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
            pre { background: #f1f5f9; padding: 1em; border-radius: 6px; overflow-x: auto; }
            pre code { background: none; padding: 0; }
            blockquote { border-left: 3px solid #06b6d4; padding: 0.5em 1em; margin: 1em 0; color: #64748b; font-style: italic; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            th, td { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; text-align: left; }
            th { background: #f1f5f9; font-weight: 600; }
            img { max-width: 100%; }
            hr { border: none; border-top: 2px solid #e2e8f0; margin: 2em 0; }
          </style>
        </head>
        <body>
          <h1>${document.title}</h1>
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }, [editor, document.title]);

  const handleExportHTML = useCallback(() => {
    if (!editor) return;
    const html = `<!DOCTYPE html>
<html>
<head><title>${document.title}</title></head>
<body>
<h1>${document.title}</h1>
${editor.getHTML()}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = `${document.title}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editor, document.title]);

  const handleExportMarkdown = useCallback(() => {
    if (!editor) return;
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const markdown = turndown.turndown(editor.getHTML());
    const blob = new Blob([`# ${document.title}\n\n${markdown}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = `${document.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editor, document.title]);

  // New document from menu bar
  const handleNewDocument = useCallback(() => {
    onBack();
  }, [onBack]);

  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const charCount = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Document Header */}
      <DocumentHeader
        title={document.title}
        isFavorite={document.isFavorite}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        accentColor={DOCS_ACCENT}
      />

      {/* Menu Bar */}
      {editor && !readingMode && (
        <DocsMenuBar
          editor={editor}
          onNewDocument={handleNewDocument}
          onExportPDF={handleExportPDF}
          onExportHTML={handleExportHTML}
          onExportMarkdown={handleExportMarkdown}
        />
      )}

      {/* Toolbar */}
      {editor && !readingMode && (
        <DocsToolbar editor={editor} />
      )}

      {/* Find & Replace */}
      {editor && findReplaceVisible && (
        <FindReplacePanel
          editor={editor}
          onClose={() => setFindReplaceVisible(false)}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {editor && sidebarVisible && !readingMode && (
          <DocsSidebar
            editor={editor}
            onClose={toggleSidebar}
          />
        )}

        {/* Editor area */}
        <div
          ref={editorContainerRef}
          className="flex-1 overflow-y-auto"
          style={{
            background: 'var(--docs-bg)',
            padding: readingMode ? '0' : '24px',
          }}
        >
          <div
            className={readingMode ? 'docs-reading' : 'docs-page-container'}
            style={{
              transform: readingMode ? undefined : `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <div className="docs-editor">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="docs-footer">
        <span>{wordCount} words</span>
        <span style={{ color: 'var(--docs-border)' }}>|</span>
        <span>{charCount} characters</span>
        <span style={{ color: 'var(--docs-border)' }}>|</span>
        <span>{zoom}%</span>
        <span className="ml-auto">
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
        </span>
      </div>
    </div>
  );
}
