'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

import { Note, NoteFolder, NoteTag, NOTE_COLORS } from './types';
import { OGPreviewExtension } from './OGPreviewExtension';
import EditorToolbar from './EditorToolbar';
import { useNotesStore } from '@/lib/store/useNotesStore';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { toast } from 'sonner';

// Lazy-loaded panels
import { lazy, Suspense } from 'react';
const ReminderModal = lazy(() => import('./ReminderModal'));
const LockModal = lazy(() => import('./LockModal'));
const ShareModal = lazy(() => import('./ShareModal'));
const ExportModal = lazy(() => import('./ExportModal'));
const VersionHistoryPanel = lazy(() => import('./VersionHistoryPanel'));
const TemplateSelector = lazy(() => import('./TemplateSelector'));
const TweetFormatter = lazy(() => import('./TweetFormatter'));
const ColorPickerDropdown = lazy(() => import('./ColorPickerDropdown'));
const TagEditor = lazy(() => import('./TagEditor'));
const FolderSelector = lazy(() => import('./FolderSelector'));
const MarkdownEditor = lazy(() => import('./MarkdownEditor'));

const lowlight = createLowlight(common);

const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';
const AUTOSAVE_DELAY = 1500;

interface Props {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  tags: NoteTag[];
  folders: NoteFolder[];
}

export default function NoteEditor({ note, onUpdate, onDelete, onRefresh, tags, folders }: Props) {
  const { readingMode, markdownMode, toggleReadingMode, toggleMarkdownMode } = useNotesStore();
  const dataStore = useNotesDataStore();
  const [title, setTitle] = useState(note.title);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlocked, setUnlocked] = useState(!note.isLocked);

  // Panel states
  const [showReminder, setShowReminder] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTweet, setShowTweet] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteId = useRef(note.id);
  const titleRef = useRef(title);
  titleRef.current = title;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      Image,
      CharacterCount,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start writing your note...' }),
      OGPreviewExtension,
    ],
    content: (() => { try { return JSON.parse(note.content); } catch { return EMPTY_DOC; } })(),
    editorProps: {
      attributes: { class: 'notes-editor' },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')?.trim();
        // Only intercept plain-URL pastes (no HTML, single line, valid URL)
        if (!text || event.clipboardData?.getData('text/html') || text.includes('\n')) return false;
        if (!/^https?:\/\/[^\s]+$/.test(text)) return false;

        const { state, dispatch } = view;
        const node = state.schema.nodes.ogPreview?.create({
          url: text, title: text, description: null, image: null, siteName: null,
        });
        if (!node) return false;

        dispatch(state.tr.replaceSelectionWith(node));

        // In offline mode, just display the URL as-is (no OG fetch)
        return true;
      },
    },
    onUpdate: () => scheduleSave(),
  });

  // Update editor when note changes
  useEffect(() => {
    if (!editor) return;
    if (note.id !== currentNoteId.current) {
      currentNoteId.current = note.id;
      setTitle(note.title);
      setUnlocked(!note.isLocked);
      const content = (() => { try { return JSON.parse(note.content); } catch { return EMPTY_DOC; } })();
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [note.id, note.content, note.title, note.isLocked, editor]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, AUTOSAVE_DELAY);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback(() => {
    if (!editor) return;
    const content = JSON.stringify(editor.getJSON());
    const wordCount = editor.storage.characterCount?.words() ?? 0;
    const charCount = editor.storage.characterCount?.characters() ?? 0;
    setSaving(true);
    const updated = dataStore.updateNote(currentNoteId.current, {
      title: titleRef.current,
      content,
      wordCount,
      charCount,
    });
    if (updated) {
      onUpdate(updated);
      setSavedAt(new Date());
    }
    setSaving(false);
  }, [editor, onUpdate, dataStore]);

  // Save on title change
  const handleTitleChange = (v: string) => {
    setTitle(v);
    scheduleSave();
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        doSave();
      }
    };
  }, [doSave]);

  // Keyboard shortcuts in editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 's') { e.preventDefault(); if (saveTimer.current) clearTimeout(saveTimer.current); doSave(); }
      if (meta && e.shiftKey && e.key === 'r') { e.preventDefault(); toggleReadingMode(); }
      if (meta && e.shiftKey && e.key === 'm') { e.preventDefault(); toggleMarkdownMode(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSave, toggleReadingMode, toggleMarkdownMode]);

  const handleColorChange = (colorId: string) => {
    setShowColorPicker(false);
    const color = colorId === 'none' ? null : colorId;
    const updated = dataStore.updateNote(note.id, { color });
    if (updated) onUpdate(updated);
  };

  const handleTagsChange = (tagIds: string[]) => {
    const updated = dataStore.updateNote(note.id, { tagIds });
    if (updated) { onUpdate(updated); onRefresh(); }
  };

  const handleFolderChange = (folderId: string | null) => {
    setShowFolderSelector(false);
    const updated = dataStore.updateNote(note.id, { folderId });
    if (updated) onUpdate(updated);
  };

  const handlePin = () => {
    const updated = dataStore.updateNote(note.id, { isPinned: !note.isPinned });
    if (updated) onUpdate(updated);
  };

  const handleFav = () => {
    const updated = dataStore.updateNote(note.id, { isFavorite: !note.isFavorite });
    if (updated) onUpdate(updated);
  };

  const handleTrash = () => {
    const updated = dataStore.softDeleteNote(note.id);
    if (updated) { onDelete(note.id); toast.success('Moved to trash'); }
  };

  const handleVersionRestore = (versionId: string) => {
    const updated = dataStore.restoreVersion(note.id, versionId);
    if (updated) {
      onUpdate(updated);
      setShowVersions(false);
      const content = (() => { try { return JSON.parse(updated.content); } catch { return EMPTY_DOC; } })();
      editor?.commands.setContent(content, { emitUpdate: false });
      toast.success('Version restored');
    }
  };

  const colorEntry = NOTE_COLORS.find((c) => c.id === note.color);
  const bgStyle = colorEntry?.bg ? { background: colorEntry.bg } : { background: 'var(--notes-surface)' };

  if (note.isLocked && !unlocked) {
    return (
      <div className="flex-1 flex items-center justify-center" style={bgStyle}>
        <div className="text-center space-y-4 p-8">
          <div className="text-5xl">🔒</div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--notes-text)' }}>This note is locked</h3>
          <p style={{ color: 'var(--notes-text-muted)' }}>Enter the password to view this note.</p>
          <button
            onClick={() => setShowLock(true)}
            className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
          >
            Unlock Note
          </button>
          {showLock && (
            <Suspense fallback={null}>
              <LockModal
                note={note}
                mode="unlock"
                onSuccess={() => { setUnlocked(true); setShowLock(false); }}
                onClose={() => setShowLock(false)}
                onNoteUpdate={onUpdate}
              />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  const wordCount = editor?.storage.characterCount?.words() ?? note.wordCount;
  const charCount = editor?.storage.characterCount?.characters() ?? note.charCount;

  return (
    <div className="flex flex-col h-full" style={bgStyle}>
      {/* Top meta bar */}
      <div className="flex items-center gap-2 px-4 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--notes-border)', background: 'var(--notes-surface)' }}>
        {/* Title */}
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="flex-1 min-w-0 font-bold text-lg bg-transparent outline-none"
          style={{ color: 'var(--notes-text)' }}
        />

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <IconBtn onClick={handlePin} title={note.isPinned ? 'Unpin' : 'Pin'} active={note.isPinned} activeColor="var(--notes-pin-color)">📌</IconBtn>
          <IconBtn onClick={handleFav} title={note.isFavorite ? 'Unfavorite' : 'Favorite'} active={note.isFavorite} activeColor="var(--notes-fav-color)">⭐</IconBtn>
          <IconBtn onClick={() => setShowColorPicker((v) => !v)} title="Note color">🎨</IconBtn>
          <IconBtn onClick={() => setShowTagEditor((v) => !v)} title="Tags">🏷️</IconBtn>
          <IconBtn onClick={() => setShowFolderSelector((v) => !v)} title="Move to folder">📁</IconBtn>
          <IconBtn onClick={() => setShowReminder(true)} title="Add reminder">🔔</IconBtn>
          <IconBtn onClick={toggleReadingMode} title="Reading mode (⌘⇧R)" active={readingMode}>📖</IconBtn>
          <IconBtn onClick={toggleMarkdownMode} title="Markdown mode (⌘⇧M)" active={markdownMode}>Md</IconBtn>
          <IconBtn onClick={() => setShowVersions(true)} title="Version history">🕐</IconBtn>
          <IconBtn onClick={() => setShowShare(true)} title="Share link">🔗</IconBtn>
          <IconBtn onClick={() => setShowExport(true)} title="Export">⬇️</IconBtn>
          <IconBtn onClick={() => setShowTweet(true)} title="Tweet formatter">𝕏</IconBtn>
          <IconBtn onClick={() => setShowLock(true)} title={note.isLocked ? 'Manage lock' : 'Lock note'} active={note.isLocked} activeColor="var(--notes-lock-color)">🔒</IconBtn>
          <div className="w-px h-4 mx-1" style={{ background: 'var(--notes-border)' }} />
          <IconBtn onClick={handleTrash} title="Move to trash" danger>🗑️</IconBtn>
        </div>
      </div>

      {/* Dropdowns */}
      {showColorPicker && (
        <Suspense fallback={null}>
          <ColorPickerDropdown currentColor={note.color} onChange={handleColorChange} onClose={() => setShowColorPicker(false)} />
        </Suspense>
      )}
      {showTagEditor && (
        <Suspense fallback={null}>
          <TagEditor noteTagIds={note.tags.map((t) => t.tagId)} allTags={tags} onChange={handleTagsChange} onClose={() => setShowTagEditor(false)} />
        </Suspense>
      )}
      {showFolderSelector && (
        <Suspense fallback={null}>
          <FolderSelector currentFolderId={note.folderId} folders={folders} onChange={handleFolderChange} onClose={() => setShowFolderSelector(false)} />
        </Suspense>
      )}

      {/* Toolbar (when not reading mode) */}
      {!readingMode && !markdownMode && editor && (
        <EditorToolbar editor={editor} />
      )}

      {/* Editor area */}
      <div className={`flex-1 overflow-y-auto${readingMode ? ' notes-reading' : ''}`} style={{ padding: readingMode ? '0' : '0 1.5rem' }}>
        {markdownMode ? (
          <Suspense fallback={null}>
            <MarkdownEditor
              content={note.content}
              onSave={async (content) => {
                const updated = dataStore.updateNote(note.id, { content });
                if (updated) { onUpdate(updated); setSavedAt(new Date()); }
              }}
            />
          </Suspense>
        ) : (
          <div className={`notes-editor${readingMode ? ' notes-reading' : ''}`} style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-xs" style={{ borderTop: '1px solid var(--notes-border)', color: 'var(--notes-text-subtle)' }}>
        <span>{wordCount} words · {charCount} chars</span>
        {note.folder && (
          <span>📁 {note.folder.name}</span>
        )}
        {note.tags.length > 0 && (
          <span>{note.tags.map((t) => `#${t.tag.name}`).join(' ')}</span>
        )}
        <span className="ml-auto">
          {saving ? '💾 Saving...' : savedAt ? `✓ Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>

      {/* Modals */}
      {showReminder && <Suspense fallback={null}><ReminderModal note={note} onClose={() => setShowReminder(false)} onSaved={onRefresh} /></Suspense>}
      {showLock && (
        <Suspense fallback={null}>
          <LockModal
            note={note}
            mode={note.isLocked ? 'manage' : 'set'}
            onSuccess={() => { setShowLock(false); onRefresh(); }}
            onClose={() => setShowLock(false)}
            onNoteUpdate={onUpdate}
          />
        </Suspense>
      )}
      {showShare && <Suspense fallback={null}><ShareModal note={note} onClose={() => setShowShare(false)} /></Suspense>}
      {showExport && <Suspense fallback={null}><ExportModal note={note} onClose={() => setShowExport(false)} editorHtml={editor?.getHTML() ?? ''} /></Suspense>}
      {showVersions && (
        <Suspense fallback={null}>
          <VersionHistoryPanel noteId={note.id} onRestore={handleVersionRestore} onClose={() => setShowVersions(false)} />
        </Suspense>
      )}
      {showTemplates && (
        <Suspense fallback={null}>
          <TemplateSelector
            onSelect={(content) => {
              editor?.commands.setContent(JSON.parse(content), { emitUpdate: false });
              setShowTemplates(false);
              scheduleSave();
            }}
            onClose={() => setShowTemplates(false)}
          />
        </Suspense>
      )}
      {showTweet && <Suspense fallback={null}><TweetFormatter content={editor?.getText() ?? ''} title={note.title} onClose={() => setShowTweet(false)} /></Suspense>}
    </div>
  );
}

function IconBtn({ children, onClick, title, active, activeColor, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  activeColor?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded-lg text-sm transition-colors font-medium"
      style={{
        background: active ? 'var(--notes-surface-2)' : 'transparent',
        color: active && activeColor ? activeColor : danger ? 'var(--notes-danger)' : 'var(--notes-text-muted)',
        opacity: active ? 1 : undefined,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--notes-surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? 'var(--notes-surface-2)' : 'transparent')}
    >
      {children}
    </button>
  );
}
