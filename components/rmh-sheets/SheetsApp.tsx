'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import type { StoredDocument } from '@/lib/store/useDocumentStore';
import type { DocumentInfo } from '@/lib/rmh-utils/types';
import SheetsHome from './SheetsHome';

const SheetsEditor = lazy(() => import('./SheetsEditor'));

const ACCENT = '#10b981';

// Adapt StoredDocument to DocumentInfo shape
function toDocumentInfo(doc: StoredDocument): DocumentInfo {
  return {
    id: doc.id,
    type: 'SHEET',
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

export default function SheetsApp() {
  const { getDocumentsByType, createDocument, updateDocument, softDeleteDocument } = useDocumentStore();
  const [currentDoc, setCurrentDoc] = useState<DocumentInfo | null>(null);

  const documents = getDocumentsByType('SHEET').map(toDocumentInfo);

  const handleCreate = useCallback(() => {
    const doc = createDocument('SHEET', 'Untitled Spreadsheet');
    setCurrentDoc(toDocumentInfo(doc));
  }, [createDocument]);

  const handleDelete = useCallback((id: string) => {
    softDeleteDocument(id);
    if (currentDoc?.id === id) setCurrentDoc(null);
  }, [softDeleteDocument, currentDoc]);

  const handleFavorite = useCallback((id: string, fav: boolean) => {
    const updated = updateDocument(id, { isFavorite: fav });
    if (updated && currentDoc?.id === id) {
      setCurrentDoc(toDocumentInfo(updated));
    }
  }, [updateDocument, currentDoc]);

  const handleRename = useCallback((id: string, title: string) => {
    const updated = updateDocument(id, { title });
    if (updated && currentDoc?.id === id) {
      setCurrentDoc(toDocumentInfo(updated));
    }
  }, [updateDocument, currentDoc]);

  const handleBack = useCallback(() => {
    setCurrentDoc(null);
  }, []);

  // Editor view
  if (currentDoc) {
    return (
      <div className="sheets-theme h-screen flex flex-col" style={{ background: 'var(--sheets-bg)', color: 'var(--sheets-text)' }}>
        <Suspense fallback={null}>
          <SheetsEditor
            document={currentDoc}
            onBack={handleBack}
            onRename={(title) => handleRename(currentDoc.id, title)}
            onToggleFavorite={() => handleFavorite(currentDoc.id, !currentDoc.isFavorite)}
          />
        </Suspense>
      </div>
    );
  }

  // Home view
  return (
    <div className="sheets-theme h-screen flex flex-col" style={{ background: 'var(--sheets-bg)', color: 'var(--sheets-text)' }}>
      <SheetsHome
        documents={documents}
        onOpen={setCurrentDoc}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onFavorite={handleFavorite}
        onRename={handleRename}
      />
    </div>
  );
}
