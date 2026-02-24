'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { useDocsStore } from '@/lib/store/useDocsStore';

interface Props {
  editor: Editor;
  onNewDocument: () => void;
  onExportPDF: () => void;
  onExportHTML: () => void;
  onExportMarkdown: () => void;
}

type MenuKey = 'file' | 'edit' | 'view' | 'insert' | 'format' | null;

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
}

export default function DocsMenuBar({ editor, onNewDocument, onExportPDF, onExportHTML, onExportMarkdown }: Props) {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const { toggleSidebar, toggleFindReplace, toggleReadingMode, zoomIn, zoomOut, resetZoom, zoom } = useDocsStore();

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const fileMenu: MenuItem[] = [
    { label: 'New Document', shortcut: '', action: () => { onNewDocument(); closeMenu(); } },
    { label: 'Save snapshot', shortcut: '\u2318S', action: () => { closeMenu(); }, separator: true },
    { label: 'Export as PDF', action: () => { onExportPDF(); closeMenu(); } },
    { label: 'Export as HTML', action: () => { onExportHTML(); closeMenu(); } },
    { label: 'Export as Markdown', action: () => { onExportMarkdown(); closeMenu(); } },
  ];

  const editMenu: MenuItem[] = [
    { label: 'Undo', shortcut: '\u2318Z', action: () => { editor.chain().focus().undo().run(); closeMenu(); } },
    { label: 'Redo', shortcut: '\u2318\u21e7Z', action: () => { editor.chain().focus().redo().run(); closeMenu(); }, separator: true },
    { label: 'Find & Replace', shortcut: '\u2318F', action: () => { toggleFindReplace(); closeMenu(); }, separator: true },
    { label: 'Select All', shortcut: '\u2318A', action: () => { editor.chain().focus().selectAll().run(); closeMenu(); } },
  ];

  const viewMenu: MenuItem[] = [
    { label: 'Toggle Sidebar', shortcut: '\u2318\\', action: () => { toggleSidebar(); closeMenu(); }, separator: true },
    { label: `Zoom In (${zoom}%)`, shortcut: '\u2318+', action: () => { zoomIn(); closeMenu(); } },
    { label: 'Zoom Out', shortcut: '\u2318\u2212', action: () => { zoomOut(); closeMenu(); } },
    { label: 'Reset Zoom', shortcut: '\u23180', action: () => { resetZoom(); closeMenu(); }, separator: true },
    { label: 'Reading Mode', shortcut: '\u2318\u21e7R', action: () => { toggleReadingMode(); closeMenu(); } },
  ];

  const insertMenu: MenuItem[] = [
    { label: 'Table (3x3)', action: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); closeMenu(); } },
    { label: 'Image from URL', action: () => {
      const url = window.prompt('Enter image URL:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
      closeMenu();
    }},
    { label: 'Horizontal Rule', action: () => { editor.chain().focus().setHorizontalRule().run(); closeMenu(); }, separator: true },
    { label: 'Code Block', action: () => { editor.chain().focus().toggleCodeBlock().run(); closeMenu(); } },
    { label: 'Blockquote', action: () => { editor.chain().focus().toggleBlockquote().run(); closeMenu(); } },
    { label: 'Link', action: () => {
      const url = window.prompt('Enter URL:');
      if (url) editor.chain().focus().setLink({ href: url }).run();
      closeMenu();
    }},
  ];

  const formatMenu: MenuItem[] = [
    { label: 'Bold', shortcut: '\u2318B', action: () => { editor.chain().focus().toggleBold().run(); closeMenu(); } },
    { label: 'Italic', shortcut: '\u2318I', action: () => { editor.chain().focus().toggleItalic().run(); closeMenu(); } },
    { label: 'Underline', shortcut: '\u2318U', action: () => { editor.chain().focus().toggleUnderline().run(); closeMenu(); } },
    { label: 'Strikethrough', shortcut: '\u2318\u21e7X', action: () => { editor.chain().focus().toggleStrike().run(); closeMenu(); }, separator: true },
    { label: 'Heading 1', action: () => { editor.chain().focus().toggleHeading({ level: 1 }).run(); closeMenu(); } },
    { label: 'Heading 2', action: () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); closeMenu(); } },
    { label: 'Heading 3', action: () => { editor.chain().focus().toggleHeading({ level: 3 }).run(); closeMenu(); }, separator: true },
    { label: 'Bullet List', action: () => { editor.chain().focus().toggleBulletList().run(); closeMenu(); } },
    { label: 'Numbered List', action: () => { editor.chain().focus().toggleOrderedList().run(); closeMenu(); } },
    { label: 'Task List', action: () => { editor.chain().focus().toggleTaskList().run(); closeMenu(); }, separator: true },
    { label: 'Clear Formatting', action: () => { editor.chain().focus().clearNodes().unsetAllMarks().run(); closeMenu(); } },
  ];

  const menus: { key: MenuKey; label: string; items: MenuItem[] }[] = [
    { key: 'file', label: 'File', items: fileMenu },
    { key: 'edit', label: 'Edit', items: editMenu },
    { key: 'view', label: 'View', items: viewMenu },
    { key: 'insert', label: 'Insert', items: insertMenu },
    { key: 'format', label: 'Format', items: formatMenu },
  ];

  return (
    <div
      ref={menuBarRef}
      className="flex items-center gap-0 px-2 py-0.5"
      style={{
        background: 'var(--docs-menubar-bg)',
        borderBottom: '1px solid var(--docs-border)',
        fontSize: '13px',
      }}
    >
      {menus.map(({ key, label, items }) => (
        <div key={key} className="relative">
          <button
            className="px-3 py-1 rounded-sm transition-colors"
            style={{
              color: openMenu === key ? 'var(--docs-accent)' : 'var(--docs-text-muted)',
              background: openMenu === key ? 'var(--docs-surface-2)' : 'transparent',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpenMenu(openMenu === key ? null : key);
            }}
            onMouseEnter={() => {
              if (openMenu && openMenu !== key) setOpenMenu(key);
            }}
          >
            {label}
          </button>

          {openMenu === key && (
            <div className="docs-menu-dropdown">
              {items.map((item, idx) => (
                <div key={item.label}>
                  <button
                    className="docs-menu-item"
                    onClick={item.action}
                    disabled={item.disabled}
                    style={item.disabled ? { opacity: 0.4 } : undefined}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                  </button>
                  {item.separator && idx < items.length - 1 && <div className="docs-menu-separator" />}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
