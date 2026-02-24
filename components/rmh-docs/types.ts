import type { CollaboratorInfo } from '@/lib/rmh-utils/types';

export interface DocsDocument {
  id: string;
  type: 'DOC';
  title: string;
  userId: string;
  isFavorite: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  collaborators: CollaboratorInfo[];
  user: { id: string; name: string | null; image: string | null };
}

export interface HeadingNode {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface FindReplaceState {
  searchTerm: string;
  replaceTerm: string;
  matchCase: boolean;
  currentIndex: number;
  totalMatches: number;
}

export const DOCS_ACCENT = '#06b6d4';
export const DOCS_ACCENT_HOVER = '#0891b2';
