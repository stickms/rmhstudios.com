'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import type { StoredDocument } from '@/lib/store/useDocumentStore';
import type { DocumentInfo } from '@/lib/rmh-utils/types';

const SlidesHome = lazy(() => import('./SlidesHome'));
const SlidesEditor = lazy(() => import('./SlidesEditor'));

// Adapt StoredDocument to DocumentInfo shape
function toDocumentInfo(doc: StoredDocument): DocumentInfo {
  return {
    id: doc.id,
    type: 'SLIDE',
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

export default function SlidesApp() {
  const { getDocumentsByType, createDocument, updateDocument, softDeleteDocument } = useDocumentStore();
  const [activeDoc, setActiveDoc] = useState<DocumentInfo | null>(null);

  const documents = getDocumentsByType('SLIDE').map(toDocumentInfo);

  const handleCreate = useCallback(() => {
    const doc = createDocument('SLIDE', 'Untitled Presentation');
    setActiveDoc(toDocumentInfo(doc));
  }, [createDocument]);

  const handleDelete = useCallback((id: string) => {
    softDeleteDocument(id);
    if (activeDoc?.id === id) setActiveDoc(null);
  }, [softDeleteDocument, activeDoc]);

  const handleFavorite = useCallback((id: string, fav: boolean) => {
    const updated = updateDocument(id, { isFavorite: fav });
    if (updated && activeDoc?.id === id) {
      setActiveDoc(toDocumentInfo(updated));
    }
  }, [updateDocument, activeDoc]);

  const handleRename = useCallback((id: string, title: string) => {
    const updated = updateDocument(id, { title });
    if (updated && activeDoc?.id === id) {
      setActiveDoc(toDocumentInfo(updated));
    }
  }, [updateDocument, activeDoc]);

  if (activeDoc) {
    return (
      <Suspense fallback={null}>
        <SlidesEditor
          document={activeDoc}
          onBack={() => setActiveDoc(null)}
          onRename={(title) => handleRename(activeDoc.id, title)}
          onToggleFavorite={() => handleFavorite(activeDoc.id, !activeDoc.isFavorite)}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
        <SlidesHome
        documents={documents}
        onOpen={setActiveDoc}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onFavorite={handleFavorite}
        onRename={handleRename}
      />
    </Suspense>
  );
}
