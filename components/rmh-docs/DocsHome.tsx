'use client';

import DocumentList from '@/components/rmh-utils/DocumentList';
import type { DocsDocument } from './types';
import { DOCS_ACCENT, DOCS_ACCENT_HOVER } from './types';
import type { DocumentInfo } from '@/lib/rmh-utils/types';

interface Props {
  documents: DocsDocument[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (doc: DocsDocument) => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string, fav: boolean) => void;
  onRename: (id: string, title: string) => void;
}

export default function DocsHome({ documents, loading, onCreate, onOpen, onDelete, onFavorite, onRename }: Props) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3" style={{ color: 'var(--docs-text-muted)' }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading documents...</span>
        </div>
      </div>
    );
  }

  return (
    <DocumentList
      documents={documents as unknown as DocumentInfo[]}
      docType="DOC"
      onOpen={(doc) => onOpen(doc as unknown as DocsDocument)}
      onCreate={onCreate}
      onDelete={onDelete}
      onFavorite={onFavorite}
      onRename={onRename}
      accentColor={DOCS_ACCENT}
      accentHover={DOCS_ACCENT_HOVER}
    />
  );
}
