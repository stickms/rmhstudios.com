'use client';

import DocumentList from '@/components/rmh-utils/DocumentList';
import type { DocumentInfo } from '@/lib/rmh-utils/types';

interface Props {
  documents: DocumentInfo[];
  onOpen: (doc: DocumentInfo) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string, fav: boolean) => void;
  onRename: (id: string, title: string) => void;
}

export default function SlidesHome({ documents, onOpen, onCreate, onDelete, onFavorite, onRename }: Props) {
  return (
    <div className="slides-theme flex h-screen" style={{ background: 'var(--slides-bg)', color: 'var(--slides-text)', fontFamily: 'var(--slides-font)' }}>
      <div className="flex-1">
        <DocumentList
          documents={documents}
          docType="SLIDE"
          onOpen={onOpen}
          onCreate={onCreate}
          onDelete={onDelete}
          onFavorite={onFavorite}
          onRename={onRename}
          accentColor="#f97316"
          accentHover="#ea580c"
        />
      </div>
    </div>
  );
}
