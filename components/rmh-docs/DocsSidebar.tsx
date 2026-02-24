'use client';

import { useEffect, useState, useCallback } from 'react';
import { List, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { HeadingNode } from './types';

interface Props {
  editor: Editor;
  onClose: () => void;
}

export default function DocsSidebar({ editor, onClose }: Props) {
  const [headings, setHeadings] = useState<HeadingNode[]>([]);

  const extractHeadings = useCallback(() => {
    const items: HeadingNode[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level as number;
        if (level >= 1 && level <= 3) {
          items.push({
            id: `heading-${pos}`,
            level,
            text: node.textContent || 'Untitled',
            pos,
          });
        }
      }
    });
    setHeadings(items);
  }, [editor]);

  useEffect(() => {
    extractHeadings();

    // Listen to document changes to update the outline
    const updateHandler = () => extractHeadings();
    editor.on('update', updateHandler);
    return () => {
      editor.off('update', updateHandler);
    };
  }, [editor, extractHeadings]);

  const scrollToHeading = useCallback((pos: number) => {
    editor.chain().setTextSelection(pos).scrollIntoView().run();
    editor.commands.focus();
  }, [editor]);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: '240px',
        minWidth: '240px',
        background: 'var(--docs-sidebar-bg)',
        borderRight: '1px solid var(--docs-sidebar-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--docs-sidebar-border)' }}>
        <div className="flex items-center gap-2">
          <List size={14} style={{ color: 'var(--docs-accent)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--docs-text-muted)' }}>
            Outline
          </span>
        </div>
        <button onClick={onClose} className="docs-toolbar-btn" title="Close outline">
          <X size={14} />
        </button>
      </div>

      {/* Headings */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-xs" style={{ color: 'var(--docs-text-subtle)' }}>
              No headings found.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--docs-text-subtle)' }}>
              Add headings (H1, H2, H3) to see the document outline here.
            </p>
          </div>
        ) : (
          headings.map((heading) => (
            <button
              key={heading.id}
              onClick={() => scrollToHeading(heading.pos)}
              className={`docs-outline-item h${heading.level}`}
              title={heading.text}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
