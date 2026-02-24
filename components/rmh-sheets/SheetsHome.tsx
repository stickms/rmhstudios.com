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

export default function SheetsHome({ documents, onOpen, onCreate, onDelete, onFavorite, onRename }: Props) {
  return (
    <DocumentList
      documents={documents}
      docType="SHEET"
      onOpen={onOpen}
      onCreate={onCreate}
      onDelete={onDelete}
      onFavorite={onFavorite}
      onRename={onRename}
      accentColor="#10b981"
      accentHover="#0ea572"
    />
  );
}
