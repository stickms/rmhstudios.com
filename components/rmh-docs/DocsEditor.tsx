'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useCollaboration } from '@/lib/rmh-utils/useCollaboration';
import { useDocsStore } from '@/lib/store/useDocsStore';
import { authClient } from '@/lib/auth-client';
import { createDocsExtensions } from '@/lib/rmh-docs/extensions';
import { getCollabColor } from '@/lib/rmh-utils/types';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import ShareDialog from '@/components/rmh-utils/ShareDialog';
import DocsToolbar from './DocsToolbar';
import DocsMenuBar from './DocsMenuBar';
import DocsSidebar from './DocsSidebar';
import FindReplacePanel from './FindReplacePanel';
import { DOCS_ACCENT } from './types';
import type { DocsDocument } from './types';
import type { CollaboratorInfo, CollaboratorRole } from '@/lib/rmh-utils/types';
import TurndownService from 'turndown';

interface Props {
  document: DocsDocument;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
}

export default function DocsEditor({ document, onBack, onRename, onToggleFavorite }: Props) {
  const { zoom, sidebarVisible, findReplaceVisible, readingMode, toggleSidebar, toggleFindReplace, toggleReadingMode, setFindReplaceVisible } = useDocsStore();

  const [sessionToken, setSessionToken] = useState<string>('');
  const [user, setUser] = useState<{ id: string; name: string | null; image: string | null } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>(document.collaborators);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Get session info
  useEffect(() => {
    authClient.getSession().then((res) => {
      if (res.data?.session) {
        setUser(res.data.user as { id: string; name: string | null; image: string | null });
        // Extract session token from cookie
        const cookies = globalThis.document?.cookie?.split(';') ?? [];
        for (const cookie of cookies) {
          const [key, val] = cookie.trim().split('=');
          if (key === 'better-auth.session_token') {
            setSessionToken(decodeURIComponent(val));
            break;
          }
        }
      }
    });
  }, []);

  // Collaboration hook
  const userForCollab = user ?? { id: 'anon', name: 'Anonymous', image: null };
  const { yDoc, provider, connected, collaborators: collabUsers } = useCollaboration({
    documentId: document.id,
    roomPrefix: 'doc',
    user: userForCollab,
    sessionToken,
  });

  // Build collab user color
  const userIndex = user ? Math.abs(hashCode(user.id)) % 15 : 0;
  const userColor = getCollabColor(userIndex);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createDocsExtensions({
      yDoc,
      provider,
      userName: user?.name || 'Anonymous',
      userColor,
    }),
    editorProps: {
      attributes: { class: 'docs-editor' },
    },
    // Collaboration handles content syncing via Y.js -- no onUpdate-based autosave needed
    // The document content is stored in the Y.js doc and synced via WebSocket
  }, [provider]); // Re-create editor when provider changes

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

  // Load collaborators
  const loadCollaborators = useCallback(async () => {
    const res = await fetch(`/api/rmh-utils/documents/${document.id}/collaborators`);
    if (res.ok) {
      const data = await res.json();
      setCollaborators(data.collaborators);
    }
  }, [document.id]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  // Share dialog handlers
  const handleAddCollaborator = useCallback(async (username: string, role: CollaboratorRole): Promise<boolean> => {
    const res = await fetch(`/api/rmh-utils/documents/${document.id}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    });
    if (res.ok) {
      await loadCollaborators();
      return true;
    }
    return false;
  }, [document.id, loadCollaborators]);

  const handleRemoveCollaborator = useCallback(async (userId: string) => {
    await fetch(`/api/rmh-utils/documents/${document.id}/collaborators?userId=${userId}`, {
      method: 'DELETE',
    });
    await loadCollaborators();
  }, [document.id, loadCollaborators]);

  // Export handlers
  const handleExportPDF = useCallback(() => {
    if (!editor) return;
    // Use the browser's print dialog for PDF export
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
        connected={connected}
        collaborators={collabUsers}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        onShare={() => setShowShare(true)}
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
        {connected && (
          <>
            <span style={{ color: 'var(--docs-border)' }}>|</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              Synced
            </span>
          </>
        )}
        {!connected && (
          <>
            <span style={{ color: 'var(--docs-border)' }}>|</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400" />
              Connecting...
            </span>
          </>
        )}
        {collabUsers.length > 0 && (
          <>
            <span style={{ color: 'var(--docs-border)' }}>|</span>
            <span>{collabUsers.length} collaborator{collabUsers.length !== 1 ? 's' : ''} online</span>
          </>
        )}
        <span className="ml-auto">
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      {/* Share Dialog */}
      <ShareDialog
        open={showShare}
        onClose={() => setShowShare(false)}
        documentId={document.id}
        collaborators={collaborators}
        ownerName={document.user.name || 'Owner'}
        onAdd={handleAddCollaborator}
        onRemove={handleRemoveCollaborator}
        accentColor={DOCS_ACCENT}
      />
    </div>
  );
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
