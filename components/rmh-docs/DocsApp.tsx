'use client';

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useDocsStore } from '@/lib/store/useDocsStore';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import type { StoredDocument } from '@/lib/store/useDocumentStore';
import type { DocsDocument } from './types';
import { DOCS_ACCENT } from './types';

import DocsHome from './DocsHome';

const DocsEditor = lazy(() => import('./DocsEditor'));

// Adapt StoredDocument to DocsDocument shape
function toDocsDocument(doc: StoredDocument): DocsDocument {
  return {
    id: doc.id,
    type: 'DOC',
    title: doc.title,
    userId: 'local',
    isFavorite: doc.isFavorite,
    isDeleted: doc.isDeleted,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    collaborators: [],
    user: { id: 'local', name: 'You', image: null },
  };
}

export default function DocsApp() {
  const { darkMode } = useDocsStore();
  const { getDocumentsByType, createDocument, updateDocument, softDeleteDocument } = useDocumentStore();

  const [systemDark, setSystemDark] = useState(false);
  const effectiveDark = darkMode === null ? systemDark : darkMode;

  const [currentDoc, setCurrentDoc] = useState<DocsDocument | null>(null);

  // System dark mode detection
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const documents = getDocumentsByType('DOC').map(toDocsDocument);

  // CRUD operations
  const handleCreate = useCallback(() => {
    const doc = createDocument('DOC', 'Untitled Document');
    setCurrentDoc(toDocsDocument(doc));
  }, [createDocument]);

  const handleDelete = useCallback((id: string) => {
    softDeleteDocument(id);
    if (currentDoc?.id === id) setCurrentDoc(null);
  }, [softDeleteDocument, currentDoc]);

  const handleFavorite = useCallback((id: string, fav: boolean) => {
    const updated = updateDocument(id, { isFavorite: fav });
    if (updated && currentDoc?.id === id) {
      setCurrentDoc(toDocsDocument(updated));
    }
  }, [updateDocument, currentDoc]);

  const handleRename = useCallback((id: string, title: string) => {
    const updated = updateDocument(id, { title });
    if (updated && currentDoc?.id === id) {
      setCurrentDoc(toDocsDocument(updated));
    }
  }, [updateDocument, currentDoc]);

  const handleBack = useCallback(() => {
    setCurrentDoc(null);
  }, []);

  return (
    <div
      className={`docs-theme${effectiveDark ? ' dark' : ''} flex flex-col h-screen overflow-hidden`}
      style={{ background: 'var(--docs-bg)', color: 'var(--docs-text)', fontFamily: 'var(--docs-font)' }}
    >
      {currentDoc ? (
        <Suspense fallback={null}>
          <DocsEditor
            document={currentDoc}
            onBack={handleBack}
            onRename={(title) => handleRename(currentDoc.id, title)}
            onToggleFavorite={() => handleFavorite(currentDoc.id, !currentDoc.isFavorite)}
          />
        </Suspense>
      ) : (
        <DocsHome
          documents={documents}
          loading={false}
          onCreate={handleCreate}
          onOpen={setCurrentDoc}
          onDelete={handleDelete}
          onFavorite={handleFavorite}
          onRename={handleRename}
        />
      )}
    </div>
  );
}
