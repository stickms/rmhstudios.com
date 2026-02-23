export interface NoteTag {
  id: string;
  name: string;
  color: string | null;
  _count?: { notes: number };
}

export interface NoteFolder {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  position: number;
  _count?: { notes: number };
  children?: NoteFolder[];
}

export interface NoteReminder {
  id: string;
  noteId: string;
  userId: string;
  title: string | null;
  dueAt: string;
  repeatRule: string | null;
  isCompleted: boolean;
  snoozedUntil: string | null;
  note?: { id: string; title: string; color: string | null };
}

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  createdAt: string;
}

export interface NoteShare {
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  color: string | null;
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  isLocked: boolean;
  folderId: string | null;
  wordCount: number;
  charCount: number;
  sortOrder: number;
  moodEmoji: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { tagId: string; tag: NoteTag }[];
  reminders: NoteReminder[];
  folder: { id: string; name: string; color: string | null } | null;
  shares?: NoteShare[];
}

export const NOTE_COLORS = [
  { id: 'none',     label: 'Default',   bg: null,      dark: null },
  { id: 'amber',    label: 'Amber',     bg: '#FDF3DC',  dark: '#2A2010' },
  { id: 'rose',     label: 'Rose',      bg: '#FDE8E8',  dark: '#2A1212' },
  { id: 'sky',      label: 'Sky',       bg: '#E0F2FE',  dark: '#0C1E28' },
  { id: 'sage',     label: 'Sage',      bg: '#E5F3E8',  dark: '#0E2010' },
  { id: 'lavender', label: 'Lavender',  bg: '#EDE8FA',  dark: '#1A1428' },
  { id: 'peach',    label: 'Peach',     bg: '#FEEEE3',  dark: '#2A1A10' },
] as const;

export type NoteColorId = typeof NOTE_COLORS[number]['id'];

export const MOOD_OPTIONS = [
  { emoji: '😄', label: 'Great',   color: '#F5C542' },
  { emoji: '🙂', label: 'Good',    color: '#7EC86B' },
  { emoji: '😐', label: 'Okay',    color: '#94A3B8' },
  { emoji: '😔', label: 'Low',     color: '#5B8FD6' },
  { emoji: '😤', label: 'Stressed',color: '#E88C5A' },
  { emoji: '😴', label: 'Tired',   color: '#A78BFA' },
  { emoji: '🤩', label: 'Excited', color: '#FB7185' },
  { emoji: '🥰', label: 'Happy',   color: '#F472B6' },
] as const;
