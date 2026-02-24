'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table, ImageIcon, Minus, Code2, Quote, Link2,
  Undo2, Redo2, Eraser, ChevronDown,
  Highlighter, Palette,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface Props {
  editor: Editor;
}

const TEXT_COLORS = [
  { color: '#0F172A', label: 'Default' },
  { color: '#EF4444', label: 'Red' },
  { color: '#F97316', label: 'Orange' },
  { color: '#EAB308', label: 'Yellow' },
  { color: '#22C55E', label: 'Green' },
  { color: '#06B6D4', label: 'Cyan' },
  { color: '#3B82F6', label: 'Blue' },
  { color: '#8B5CF6', label: 'Purple' },
  { color: '#EC4899', label: 'Pink' },
];

const HIGHLIGHT_COLORS = [
  { color: '#FEF08A', label: 'Yellow' },
  { color: '#BBF7D0', label: 'Green' },
  { color: '#BFDBFE', label: 'Blue' },
  { color: '#FBCFE8', label: 'Pink' },
  { color: '#FED7AA', label: 'Orange' },
  { color: '#DDD6FE', label: 'Purple' },
];

export default function DocsToolbar({ editor }: Props) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlightColor, setShowHighlightColor] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowHeadingMenu(false);
        setShowTextColor(false);
        setShowHighlightColor(false);
        setShowInsertMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeAll = () => {
    setShowHeadingMenu(false);
    setShowTextColor(false);
    setShowHighlightColor(false);
    setShowInsertMenu(false);
  };

  const sep = () => <div className="docs-toolbar-separator" />;

  const getCurrentHeadingLabel = () => {
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    return 'Paragraph';
  };

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-0.5 px-3 py-1 flex-wrap overflow-x-auto"
      style={{
        background: 'var(--docs-toolbar-bg)',
        borderBottom: '1px solid var(--docs-toolbar-border)',
      }}
    >
      {/* Undo / Redo */}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }}
        className="docs-toolbar-btn"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
        className="docs-toolbar-btn"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={15} />
      </button>

      {sep()}

      {/* Heading dropdown */}
      <div className="relative">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            closeAll();
            setShowHeadingMenu(!showHeadingMenu);
          }}
          className="docs-toolbar-btn gap-1 px-2"
          style={{ minWidth: '100px' }}
        >
          <span className="text-xs">{getCurrentHeadingLabel()}</span>
          <ChevronDown size={12} />
        </button>
        {showHeadingMenu && (
          <div className="docs-toolbar-dropdown">
            <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setParagraph().run(); closeAll(); }}>
              <Pilcrow size={14} /> <span>Paragraph</span>
            </button>
            <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); closeAll(); }}>
              <Heading1 size={14} /> <span style={{ fontSize: '16px', fontWeight: 700 }}>Heading 1</span>
            </button>
            <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); closeAll(); }}>
              <Heading2 size={14} /> <span style={{ fontSize: '14px', fontWeight: 600 }}>Heading 2</span>
            </button>
            <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); closeAll(); }}>
              <Heading3 size={14} /> <span style={{ fontSize: '13px', fontWeight: 600 }}>Heading 3</span>
            </button>
          </div>
        )}
      </div>

      {sep()}

      {/* Text formatting */}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        className={`docs-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`}
        title="Bold (Ctrl+B)"
      >
        <Bold size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        className={`docs-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`}
        title="Italic (Ctrl+I)"
      >
        <Italic size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        className={`docs-toolbar-btn${editor.isActive('underline') ? ' active' : ''}`}
        title="Underline (Ctrl+U)"
      >
        <Underline size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
        className={`docs-toolbar-btn${editor.isActive('strike') ? ' active' : ''}`}
        title="Strikethrough"
      >
        <Strikethrough size={15} />
      </button>

      {sep()}

      {/* Text color */}
      <div className="relative">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            closeAll();
            setShowTextColor(!showTextColor);
          }}
          className="docs-toolbar-btn gap-0.5"
          title="Text color"
        >
          <Palette size={15} />
          <ChevronDown size={10} />
        </button>
        {showTextColor && (
          <div className="docs-toolbar-dropdown" style={{ minWidth: '130px', padding: '8px' }}>
            <div className="grid grid-cols-5 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (c.label === 'Default') editor.chain().focus().unsetColor().run();
                    else editor.chain().focus().setColor(c.color).run();
                    closeAll();
                  }}
                  className="w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                  style={{ background: c.color }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight color */}
      <div className="relative">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            closeAll();
            setShowHighlightColor(!showHighlightColor);
          }}
          className={`docs-toolbar-btn gap-0.5${editor.isActive('highlight') ? ' active' : ''}`}
          title="Highlight"
        >
          <Highlighter size={15} />
          <ChevronDown size={10} />
        </button>
        {showHighlightColor && (
          <div className="docs-toolbar-dropdown" style={{ minWidth: '130px', padding: '8px' }}>
            <div className="grid grid-cols-3 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.color}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().toggleHighlight({ color: c.color }).run();
                    closeAll();
                  }}
                  className="w-6 h-6 rounded border border-black/10 transition-transform hover:scale-110"
                  style={{ background: c.color }}
                  title={c.label}
                />
              ))}
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().unsetHighlight().run();
                  closeAll();
                }}
                className="w-6 h-6 rounded border border-black/10 text-[9px] flex items-center justify-center"
                style={{ color: 'var(--docs-text-subtle)' }}
                title="Remove highlight"
              >
                <Eraser size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {sep()}

      {/* Lists */}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        className={`docs-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`}
        title="Bullet list"
      >
        <List size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        className={`docs-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`}
        title="Numbered list"
      >
        <ListOrdered size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }}
        className={`docs-toolbar-btn${editor.isActive('taskList') ? ' active' : ''}`}
        title="Task list"
      >
        <ListChecks size={15} />
      </button>

      {sep()}

      {/* Text alignment */}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('left').run(); }}
        className={`docs-toolbar-btn${editor.isActive({ textAlign: 'left' }) ? ' active' : ''}`}
        title="Align left"
      >
        <AlignLeft size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('center').run(); }}
        className={`docs-toolbar-btn${editor.isActive({ textAlign: 'center' }) ? ' active' : ''}`}
        title="Align center"
      >
        <AlignCenter size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('right').run(); }}
        className={`docs-toolbar-btn${editor.isActive({ textAlign: 'right' }) ? ' active' : ''}`}
        title="Align right"
      >
        <AlignRight size={15} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('justify').run(); }}
        className={`docs-toolbar-btn${editor.isActive({ textAlign: 'justify' }) ? ' active' : ''}`}
        title="Justify"
      >
        <AlignJustify size={15} />
      </button>

      {sep()}

      {/* Insert menu */}
      <div className="relative">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            closeAll();
            setShowInsertMenu(!showInsertMenu);
          }}
          className="docs-toolbar-btn gap-1 px-2"
        >
          <span className="text-xs">Insert</span>
          <ChevronDown size={10} />
        </button>
        {showInsertMenu && (
          <div className="docs-toolbar-dropdown">
            <button onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              closeAll();
            }}>
              <Table size={14} /> <span>Table (3x3)</span>
            </button>
            <button onMouseDown={(e) => {
              e.preventDefault();
              const url = window.prompt('Enter image URL:');
              if (url) editor.chain().focus().setImage({ src: url }).run();
              closeAll();
            }}>
              <ImageIcon size={14} /> <span>Image (URL)</span>
            </button>
            <button onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().setHorizontalRule().run();
              closeAll();
            }}>
              <Minus size={14} /> <span>Horizontal Rule</span>
            </button>
            <button onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleCodeBlock().run();
              closeAll();
            }}>
              <Code2 size={14} /> <span>Code Block</span>
            </button>
            <button onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBlockquote().run();
              closeAll();
            }}>
              <Quote size={14} /> <span>Blockquote</span>
            </button>
            <button onMouseDown={(e) => {
              e.preventDefault();
              const url = window.prompt('Enter URL:');
              if (url) editor.chain().focus().setLink({ href: url }).run();
              closeAll();
            }}>
              <Link2 size={14} /> <span>Link</span>
            </button>
          </div>
        )}
      </div>

      {sep()}

      {/* Clear formatting */}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().clearNodes().unsetAllMarks().run(); }}
        className="docs-toolbar-btn"
        title="Clear formatting"
      >
        <Eraser size={15} />
      </button>
    </div>
  );
}
