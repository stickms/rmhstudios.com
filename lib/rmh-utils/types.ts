export type DocumentType = 'DOC' | 'SHEET' | 'SLIDE';
export type CollaboratorRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export interface DocumentInfo {
  id: string;
  type: DocumentType;
  title: string;
  userId: string;
  isFavorite: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  collaborators: CollaboratorInfo[];
  user: { id: string; name: string | null; image: string | null };
}

export interface CollaboratorInfo {
  id: string;
  userId: string;
  role: CollaboratorRole;
  user: { id: string; name: string | null; image: string | null };
}

export interface DocumentVersionInfo {
  id: string;
  documentId: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

// Random user colors for collaboration cursors
const COLLAB_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D7BDE2',
];

export function getCollabColor(index: number): string {
  return COLLAB_COLORS[index % COLLAB_COLORS.length];
}
