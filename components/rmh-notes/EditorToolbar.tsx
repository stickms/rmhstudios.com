'use client';

import { Editor } from '@tiptap/react';
import { useState } from 'react';

interface Props { editor: Editor; }

export default function EditorToolbar({ editor }: Props) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);

  const btn = (
    onClick: () => void,
    label: string,
    active?: boolean,
    title?: string,
  ) => (
    <button
      key={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title ?? label}
      className="flex items-center justify-center px-2 h-7 rounded text-xs font-semibold transition-colors"
      style={{
        background: active ? 'var(--notes-surface-2)' : 'transparent',
        color: active ? 'var(--notes-accent)' : 'var(--notes-text-muted)',
        border: active ? '1px solid var(--notes-border)' : '1px solid transparent',
      }}
    >
      {label}
    </button>
  );

  const sep = (key: string) => <div key={key} className="w-px h-4" style={{ background: 'var(--notes-border)', margin: '0 2px' }} />;

  const TEXT_COLORS = [
    { label: '●', color: '#C17F3A', title: 'Amber' },
    { label: '●', color: '#D95B3A', title: 'Red' },
    { label: '●', color: '#3D7A4F', title: 'Green' },
    { label: '●', color: '#5B8FD6', title: 'Blue' },
    { label: '●', color: '#8B6FC0', title: 'Purple' },
    { label: '●', color: '#E6A817', title: 'Yellow' },
    { label: '●', color: 'var(--notes-text)', title: 'Default' },
  ];

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap overflow-x-auto"
      style={{ borderBottom: '1px solid var(--notes-border)', background: 'var(--notes-surface)' }}
    >
      {/* Headings */}
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', editor.isActive('heading', { level: 1 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', editor.isActive('heading', { level: 3 }))}
      {sep('s1')}

      {/* Text formatting */}
      {btn(() => editor.chain().focus().toggleBold().run(), 'B', editor.isActive('bold'), 'Bold (⌘B)')}
      {btn(() => editor.chain().focus().toggleItalic().run(), 'I', editor.isActive('italic'), 'Italic (⌘I)')}
      {btn(() => editor.chain().focus().toggleStrike().run(), 'S̶', editor.isActive('strike'), 'Strikethrough')}
      {btn(() => editor.chain().focus().toggleCode().run(), '<>', editor.isActive('code'), 'Inline code')}
      {btn(() => editor.chain().focus().toggleHighlight().run(), '✦', editor.isActive('highlight'), 'Highlight')}
      {sep('s2')}

      {/* Lists */}
      {btn(() => editor.chain().focus().toggleBulletList().run(), '• List', editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), '1. List', editor.isActive('orderedList'))}
      {btn(() => editor.chain().focus().toggleTaskList().run(), '☑ Tasks', editor.isActive('taskList'))}
      {sep('s3')}

      {/* Blocks */}
      {btn(() => editor.chain().focus().toggleCodeBlock().run(), 'Code', editor.isActive('codeBlock'), 'Code block')}
      {btn(() => editor.chain().focus().toggleBlockquote().run(), '" "', editor.isActive('blockquote'), 'Blockquote')}
      {sep('s4')}

      {/* Text color */}
      <div className="relative">
        <button
          onMouseDown={(e) => { e.preventDefault(); setShowColorMenu((v) => !v); setShowInsertMenu(false); }}
          className="px-2 h-7 rounded text-xs font-semibold transition-colors"
          style={{ background: 'transparent', color: 'var(--notes-text-muted)', border: '1px solid transparent' }}
          title="Text color"
        >
          A▾
        </button>
        {showColorMenu && (
          <div className="absolute top-9 left-0 z-50 flex gap-1.5 p-2 rounded-xl shadow-lg" style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)' }}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c.color}
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c.color).run(); setShowColorMenu(false); }}
                title={c.title}
                className="w-5 h-5 rounded-full text-lg leading-none transition-transform hover:scale-125"
                style={{ color: c.color }}
              >
                {c.label}
              </button>
            ))}
            <button
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColorMenu(false); }}
              className="text-xs px-1 rounded"
              style={{ color: 'var(--notes-text-muted)' }}
              title="Reset color"
            >✕</button>
          </div>
        )}
      </div>

      {sep('s5')}

      {/* Insert */}
      <div className="relative">
        <button
          onMouseDown={(e) => { e.preventDefault(); setShowInsertMenu((v) => !v); setShowColorMenu(false); }}
          className="px-2 h-7 rounded text-xs font-semibold transition-colors"
          style={{ background: 'transparent', color: 'var(--notes-text-muted)', border: '1px solid transparent' }}
          title="Insert"
        >
          Insert ▾
        </button>
        {showInsertMenu && (
          <div className="absolute top-9 left-0 z-50 rounded-xl shadow-lg overflow-hidden text-xs w-40" style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)' }}>
            {[
              { label: '─── Divider', action: () => editor.chain().focus().setHorizontalRule().run() },
              {
                label: '🔗 Link', action: () => {
                  const url = window.prompt('Enter URL:');
                  if (url) editor.chain().focus().setLink({ href: url }).run();
                }
              },
              { label: '🖼 Image URL', action: () => {
                  const url = window.prompt('Image URL:');
                  if (url) editor.chain().focus().setImage({ src: url }).run();
              }},
              { label: '⊞ Table 3×3', action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
            ].map((item) => (
              <button
                key={item.label}
                onMouseDown={(e) => { e.preventDefault(); item.action(); setShowInsertMenu(false); }}
                className="w-full text-left px-3 py-2 transition-colors"
                style={{ color: 'var(--notes-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--notes-surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {sep('s6')}

      {/* Undo/Redo */}
      {btn(() => editor.chain().focus().undo().run(), '↩', false, 'Undo (⌘Z)')}
      {btn(() => editor.chain().focus().redo().run(), '↪', false, 'Redo (⌘Y)')}
    </div>
  );
}
