'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Note, NoteTag, NoteFolder, NoteReminder, NoteVersion } from '@/components/rmh-notes/types';

// ─── Helpers ─────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();

// ─── Mood entry type ─────────────────────────────────────────────────
export interface MoodEntry {
  id: string;
  emoji: string;
  color: string;
  note: string | null;
  date: string;
}

// ─── Template type ───────────────────────────────────────────────────
export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  isBuiltin: boolean;
}

// ─── Stats type ──────────────────────────────────────────────────────
export interface NotesStats {
  totalNotes: number;
  pinnedCount: number;
  archivedCount: number;
  trashedCount: number;
  remindersTotal: number;
  remindersCompleted: number;
  overdueCount: number;
  weekNotes: number;
  tagsCount: number;
  foldersCount: number;
  streak: number;
  notesPerDay: Record<string, number>;
}

// ─── Built-in templates ──────────────────────────────────────────────
const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    id: 'tpl-meeting',
    name: 'Meeting Notes',
    isBuiltin: true,
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date: ' }, { type: 'text', text: new Date().toLocaleDateString() }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Attendees: ' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Agenda' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Action Items' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Follow up on...' }] }] }] },
      ],
    }),
  },
  {
    id: 'tpl-journal',
    name: 'Daily Journal',
    isBuiltin: true,
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Daily Journal' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Grateful for: ' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Today I accomplished: ' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Tomorrow I want to: ' }] },
        { type: 'paragraph' },
      ],
    }),
  },
  {
    id: 'tpl-todo',
    name: 'To-Do List',
    isBuiltin: true,
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'To-Do List' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'High Priority' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 1' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 2' }] }] },
        ] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Later' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 3' }] }] },
        ] },
      ],
    }),
  },
  {
    id: 'tpl-brainstorm',
    name: 'Brainstorm',
    isBuiltin: true,
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Brainstorm' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Topic: ' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Ideas' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idea 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idea 2' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idea 3' }] }] },
        ] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Next Steps' }] },
        { type: 'paragraph' },
      ],
    }),
  },
];

const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';

// ─── State interface ─────────────────────────────────────────────────
interface NotesDataState {
  // Data
  notes: Note[];
  folders: NoteFolder[];
  tags: NoteTag[];
  reminders: NoteReminder[];
  templates: NoteTemplate[];
  moods: MoodEntry[];
  versions: Record<string, NoteVersion[]>; // noteId -> versions

  // Lock passwords: noteId -> hashed password (simple hash for localStorage)
  lockPasswords: Record<string, string>;

  // ─── Note CRUD ─────────────────────────────────────────────────────
  createNote: (overrides?: Partial<{ title: string; content: string; folderId: string; templateId: string }>) => Note;
  updateNote: (id: string, data: Partial<Note & { tagIds?: string[] }>) => Note | null;
  deleteNote: (id: string) => void; // permanent delete
  softDeleteNote: (id: string) => Note | null;
  restoreNote: (id: string) => Note | null;
  duplicateNote: (id: string) => Note | null;
  getNote: (id: string) => Note | undefined;

  // ─── Note operations ───────────────────────────────────────────────
  pinNote: (id: string) => Note | null;
  favoriteNote: (id: string) => Note | null;
  archiveNote: (id: string) => Note | null;

  // ─── Filtered getters ──────────────────────────────────────────────
  getFilteredNotes: (view: string, recentNoteIds?: string[]) => Note[];

  // ─── Folders CRUD ──────────────────────────────────────────────────
  createFolder: (name: string, color?: string | null) => NoteFolder;
  deleteFolder: (id: string) => void;

  // ─── Tags CRUD ─────────────────────────────────────────────────────
  createTag: (name: string, color?: string | null) => NoteTag;
  deleteTag: (id: string) => void;

  // ─── Reminders CRUD ────────────────────────────────────────────────
  createReminder: (data: { noteId: string; title?: string; dueAt: string; repeatRule?: string }) => NoteReminder;
  updateReminder: (id: string, data: Partial<NoteReminder & { snoozeMinutes?: number }>) => NoteReminder | null;
  deleteReminder: (id: string) => void;
  getAllReminders: () => NoteReminder[];

  // ─── Templates ─────────────────────────────────────────────────────
  getTemplates: () => NoteTemplate[];
  deleteTemplate: (id: string) => void;

  // ─── Search ────────────────────────────────────────────────────────
  searchNotes: (query: string, filters?: { tagId?: string; folderId?: string; hasReminder?: boolean }) => Note[];

  // ─── Mood tracking ─────────────────────────────────────────────────
  logMood: (emoji: string, color: string, note: string | null) => void;
  getMoods: () => { moods: MoodEntry[]; todayMood: MoodEntry | null };

  // ─── Stats ─────────────────────────────────────────────────────────
  getStats: () => NotesStats;

  // ─── Version history ───────────────────────────────────────────────
  saveVersion: (noteId: string) => void;
  getVersions: (noteId: string) => NoteVersion[];
  restoreVersion: (noteId: string, versionId: string) => Note | null;

  // ─── Locking ───────────────────────────────────────────────────────
  lockNote: (noteId: string, password: string) => boolean;
  unlockNote: (noteId: string, password: string) => boolean;
  verifyLock: (noteId: string, password: string) => boolean;

  // ─── Reorder ───────────────────────────────────────────────────────
  reorderNotes: (orderedIds: string[]) => void;
}

// Simple hash for password storage in localStorage
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function extractTextFromContent(content: string): string {
  try {
    const doc = JSON.parse(content);
    const texts: string[] = [];
    const extract = (nodes: Array<Record<string, unknown>>) => {
      for (const n of nodes) {
        if (n.type === 'text' && typeof n.text === 'string') texts.push(n.text);
        if (Array.isArray(n.content)) extract(n.content);
      }
    };
    if (doc.content) extract(doc.content);
    return texts.join(' ');
  } catch {
    return '';
  }
}

function makeNote(overrides: Partial<Note> = {}): Note {
  const id = uid();
  const timestamp = now();
  return {
    id,
    userId: 'local',
    title: '',
    content: EMPTY_DOC,
    color: null,
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    isLocked: false,
    folderId: null,
    wordCount: 0,
    charCount: 0,
    sortOrder: 0,
    moodEmoji: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    reminders: [],
    folder: null,
    ...overrides,
  };
}

export const useNotesDataStore = create<NotesDataState>()(
  persist(
    (set, get) => ({
      notes: [],
      folders: [],
      tags: [],
      reminders: [],
      templates: [...BUILTIN_TEMPLATES],
      moods: [],
      versions: {},
      lockPasswords: {},

      // ─── Note CRUD ───────────────────────────────────────────────────
      createNote: (overrides) => {
        const state = get();
        let content = EMPTY_DOC;
        let title = overrides?.title ?? '';

        if (overrides?.templateId) {
          const tpl = state.templates.find((t) => t.id === overrides.templateId);
          if (tpl) content = tpl.content;
        }
        if (overrides?.content) content = overrides.content;

        const folderId = overrides?.folderId ?? null;
        const folder = folderId ? state.folders.find((f) => f.id === folderId) : null;

        const note = makeNote({
          title,
          content,
          folderId,
          folder: folder ? { id: folder.id, name: folder.name, color: folder.color } : null,
        });

        set({ notes: [note, ...state.notes] });
        return note;
      },

      updateNote: (id, data) => {
        const state = get();
        const idx = state.notes.findIndex((n) => n.id === id);
        if (idx === -1) return null;

        const existing = state.notes[idx];

        // Handle tag updates
        let tags = existing.tags;
        if (data.tagIds !== undefined) {
          tags = data.tagIds.map((tagId: string) => {
            const tag = state.tags.find((t) => t.id === tagId);
            return tag ? { tagId, tag } : null;
          }).filter(Boolean) as Note['tags'];
        }

        // Handle folder change
        let folder = existing.folder;
        if (data.folderId !== undefined) {
          if (data.folderId === null) {
            folder = null;
          } else {
            const f = state.folders.find((f) => f.id === data.folderId);
            folder = f ? { id: f.id, name: f.name, color: f.color } : null;
          }
        }

        // Save version before content changes
        if (data.content && data.content !== existing.content) {
          get().saveVersion(id);
        }

        const updated: Note = {
          ...existing,
          ...data,
          tags,
          folder,
          updatedAt: now(),
        };
        // Remove non-Note fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (updated as any).tagIds;

        // Also update reminders list on this note with the full reminder data
        updated.reminders = state.reminders.filter((r) => r.noteId === id);

        const notes = [...state.notes];
        notes[idx] = updated;
        set({ notes });
        return updated;
      },

      deleteNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          reminders: state.reminders.filter((r) => r.noteId !== id),
        }));
      },

      softDeleteNote: (id) => {
        return get().updateNote(id, { isDeleted: true, deletedAt: now() });
      },

      restoreNote: (id) => {
        return get().updateNote(id, { isDeleted: false, deletedAt: null, isArchived: false });
      },

      duplicateNote: (id) => {
        const state = get();
        const original = state.notes.find((n) => n.id === id);
        if (!original) return null;
        const note = makeNote({
          title: `${original.title} (copy)`,
          content: original.content,
          color: original.color,
          folderId: original.folderId,
          folder: original.folder,
          tags: original.tags,
          wordCount: original.wordCount,
          charCount: original.charCount,
        });
        set({ notes: [note, ...state.notes] });
        return note;
      },

      getNote: (id) => get().notes.find((n) => n.id === id),

      // ─── Note operations ─────────────────────────────────────────────
      pinNote: (id) => {
        const note = get().notes.find((n) => n.id === id);
        if (!note) return null;
        return get().updateNote(id, { isPinned: !note.isPinned });
      },

      favoriteNote: (id) => {
        const note = get().notes.find((n) => n.id === id);
        if (!note) return null;
        return get().updateNote(id, { isFavorite: !note.isFavorite });
      },

      archiveNote: (id) => {
        const note = get().notes.find((n) => n.id === id);
        if (!note) return null;
        return get().updateNote(id, { isArchived: !note.isArchived });
      },

      // ─── Filtered getters ────────────────────────────────────────────
      getFilteredNotes: (view, recentNoteIds = []) => {
        const state = get();
        const active = state.notes.filter((n) => !n.isDeleted && !n.isArchived);

        if (view === 'all') return active;
        if (view === 'pinned') return active.filter((n) => n.isPinned);
        if (view === 'favorites') return active.filter((n) => n.isFavorite);
        if (view === 'archive') return state.notes.filter((n) => n.isArchived && !n.isDeleted);
        if (view === 'trash') return state.notes.filter((n) => n.isDeleted);
        if (view === 'recent') {
          return recentNoteIds
            .map((id) => state.notes.find((n) => n.id === id))
            .filter((n): n is Note => !!n && !n.isDeleted);
        }
        if (view.startsWith('folder:')) {
          const folderId = view.slice(7);
          return active.filter((n) => n.folderId === folderId);
        }
        if (view.startsWith('tag:')) {
          const tagId = view.slice(4);
          return active.filter((n) => n.tags.some((t) => t.tagId === tagId));
        }
        return active;
      },

      // ─── Folders CRUD ────────────────────────────────────────────────
      createFolder: (name, color = null) => {
        const folder: NoteFolder = {
          id: uid(),
          name,
          color: color ?? null,
          parentId: null,
          position: get().folders.length,
          _count: { notes: 0 },
        };
        set((state) => ({ folders: [...state.folders, folder] }));
        return folder;
      },

      deleteFolder: (id) => {
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          // Move notes in this folder to root
          notes: state.notes.map((n) => n.folderId === id ? { ...n, folderId: null, folder: null } : n),
        }));
      },

      // ─── Tags CRUD ───────────────────────────────────────────────────
      createTag: (name, color = null) => {
        const tag: NoteTag = {
          id: uid(),
          name,
          color: color ?? null,
          _count: { notes: 0 },
        };
        set((state) => ({ tags: [...state.tags, tag] }));
        return tag;
      },

      deleteTag: (id) => {
        set((state) => ({
          tags: state.tags.filter((t) => t.id !== id),
          // Remove tag from notes
          notes: state.notes.map((n) => ({
            ...n,
            tags: n.tags.filter((t) => t.tagId !== id),
          })),
        }));
      },

      // ─── Reminders CRUD ──────────────────────────────────────────────
      createReminder: (data) => {
        const state = get();
        const note = state.notes.find((n) => n.id === data.noteId);
        const reminder: NoteReminder = {
          id: uid(),
          noteId: data.noteId,
          userId: 'local',
          title: data.title ?? null,
          dueAt: data.dueAt,
          repeatRule: data.repeatRule ?? null,
          isCompleted: false,
          snoozedUntil: null,
          note: note ? { id: note.id, title: note.title, color: note.color } : undefined,
        };
        const newReminders = [...state.reminders, reminder];
        // Also update the note's reminders array
        const notes = state.notes.map((n) => {
          if (n.id === data.noteId) {
            return { ...n, reminders: newReminders.filter((r) => r.noteId === n.id) };
          }
          return n;
        });
        set({ reminders: newReminders, notes });
        return reminder;
      },

      updateReminder: (id, data) => {
        const state = get();
        const idx = state.reminders.findIndex((r) => r.id === id);
        if (idx === -1) return null;

        let updated = { ...state.reminders[idx], ...data };

        // Handle snooze
        if (data.snoozeMinutes) {
          const snoozedUntil = new Date(Date.now() + data.snoozeMinutes * 60000).toISOString();
          const newDueAt = snoozedUntil;
          updated = { ...updated, snoozedUntil, dueAt: newDueAt };
          delete (updated as Record<string, unknown>).snoozeMinutes;
        }

        const reminders = [...state.reminders];
        reminders[idx] = updated;

        // Update note's reminders
        const notes = state.notes.map((n) => {
          if (n.id === updated.noteId) {
            return { ...n, reminders: reminders.filter((r) => r.noteId === n.id) };
          }
          return n;
        });

        set({ reminders, notes });
        return updated;
      },

      deleteReminder: (id) => {
        const state = get();
        const reminder = state.reminders.find((r) => r.id === id);
        const newReminders = state.reminders.filter((r) => r.id !== id);
        // Update note's reminders
        const notes = reminder
          ? state.notes.map((n) => {
              if (n.id === reminder.noteId) {
                return { ...n, reminders: newReminders.filter((r) => r.noteId === n.id) };
              }
              return n;
            })
          : state.notes;
        set({ reminders: newReminders, notes });
      },

      getAllReminders: () => get().reminders,

      // ─── Templates ───────────────────────────────────────────────────
      getTemplates: () => get().templates,

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));
      },

      // ─── Search ──────────────────────────────────────────────────────
      searchNotes: (query, filters) => {
        const state = get();
        let results = state.notes.filter((n) => !n.isDeleted);

        if (query) {
          const lower = query.toLowerCase();
          results = results.filter((n) => {
            const titleMatch = n.title.toLowerCase().includes(lower);
            const contentText = extractTextFromContent(n.content).toLowerCase();
            return titleMatch || contentText.includes(lower);
          });
        }

        if (filters?.tagId) {
          results = results.filter((n) => n.tags.some((t) => t.tagId === filters.tagId));
        }

        if (filters?.folderId) {
          results = results.filter((n) => n.folderId === filters.folderId);
        }

        if (filters?.hasReminder) {
          results = results.filter((n) => n.reminders.length > 0);
        }

        return results;
      },

      // ─── Mood tracking ───────────────────────────────────────────────
      logMood: (emoji, color, note) => {
        const today = new Date().toISOString().split('T')[0];
        set((state) => {
          // Replace today's mood if exists
          const existing = state.moods.findIndex((m) => m.date.startsWith(today));
          if (existing >= 0) {
            const moods = [...state.moods];
            moods[existing] = { ...moods[existing], emoji, color, note };
            return { moods };
          }
          return {
            moods: [{ id: uid(), emoji, color, note, date: new Date().toISOString() }, ...state.moods],
          };
        });
      },

      getMoods: () => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const todayMood = state.moods.find((m) => m.date.startsWith(today)) ?? null;
        return { moods: state.moods, todayMood };
      },

      // ─── Stats ───────────────────────────────────────────────────────
      getStats: () => {
        const state = get();
        const activeNotes = state.notes.filter((n) => !n.isDeleted);
        const nowDate = new Date();

        // Notes per day (last 28 days)
        const notesPerDay: Record<string, number> = {};
        for (let i = 27; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          notesPerDay[d.toISOString().split('T')[0]] = 0;
        }
        for (const note of activeNotes) {
          const day = note.createdAt.split('T')[0];
          if (day in notesPerDay) notesPerDay[day]++;
        }

        // This week's notes
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekNotes = activeNotes.filter((n) => new Date(n.createdAt) >= weekAgo).length;

        // Streak: consecutive days with notes
        let streak = 0;
        const dayMs = 86400000;
        for (let i = 0; i < 365; i++) {
          const d = new Date(nowDate.getTime() - i * dayMs).toISOString().split('T')[0];
          const hasNote = activeNotes.some((n) => n.createdAt.startsWith(d) || n.updatedAt.startsWith(d));
          if (hasNote) streak++;
          else break;
        }

        const overdueCount = state.reminders.filter(
          (r) => !r.isCompleted && new Date(r.dueAt) < nowDate
        ).length;

        return {
          totalNotes: activeNotes.filter((n) => !n.isArchived).length,
          pinnedCount: activeNotes.filter((n) => n.isPinned).length,
          archivedCount: state.notes.filter((n) => n.isArchived && !n.isDeleted).length,
          trashedCount: state.notes.filter((n) => n.isDeleted).length,
          remindersTotal: state.reminders.length,
          remindersCompleted: state.reminders.filter((r) => r.isCompleted).length,
          overdueCount,
          weekNotes,
          tagsCount: state.tags.length,
          foldersCount: state.folders.length,
          streak,
          notesPerDay,
        };
      },

      // ─── Version history ─────────────────────────────────────────────
      saveVersion: (noteId) => {
        const state = get();
        const note = state.notes.find((n) => n.id === noteId);
        if (!note) return;

        const version: NoteVersion = {
          id: uid(),
          noteId,
          content: note.content,
          title: note.title,
          createdAt: now(),
        };

        const existing = state.versions[noteId] ?? [];
        // Keep only last 20 versions per note
        const updated = [version, ...existing].slice(0, 20);
        set({ versions: { ...state.versions, [noteId]: updated } });
      },

      getVersions: (noteId) => get().versions[noteId] ?? [],

      restoreVersion: (noteId, versionId) => {
        const state = get();
        const versions = state.versions[noteId] ?? [];
        const version = versions.find((v) => v.id === versionId);
        if (!version) return null;

        // Save current as a version before restoring
        get().saveVersion(noteId);

        return get().updateNote(noteId, {
          title: version.title,
          content: version.content,
        });
      },

      // ─── Locking ─────────────────────────────────────────────────────
      lockNote: (noteId, password) => {
        const hashed = simpleHash(password);
        const updated = get().updateNote(noteId, { isLocked: true });
        if (updated) {
          set((state) => ({ lockPasswords: { ...state.lockPasswords, [noteId]: hashed } }));
          return true;
        }
        return false;
      },

      unlockNote: (noteId, password) => {
        const state = get();
        const storedHash = state.lockPasswords[noteId];
        if (!storedHash || simpleHash(password) !== storedHash) return false;

        get().updateNote(noteId, { isLocked: false });
        const newPasswords = { ...state.lockPasswords };
        delete newPasswords[noteId];
        set({ lockPasswords: newPasswords });
        return true;
      },

      verifyLock: (noteId, password) => {
        const state = get();
        const storedHash = state.lockPasswords[noteId];
        if (!storedHash) return false;
        return simpleHash(password) === storedHash;
      },

      // ─── Reorder ─────────────────────────────────────────────────────
      reorderNotes: (orderedIds) => {
        set((state) => ({
          notes: state.notes.map((n) => {
            const idx = orderedIds.indexOf(n.id);
            return idx >= 0 ? { ...n, sortOrder: idx } : n;
          }),
        }));
      },
    }),
    {
      name: 'rmh-notes-data',
    }
  )
);
