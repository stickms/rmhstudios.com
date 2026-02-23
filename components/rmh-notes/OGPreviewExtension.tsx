'use client';

import { Node, mergeAttributes, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

function OGPreviewCard({ node, deleteNode }: NodeViewProps) {
  const { url, title, description, image, siteName } = node.attrs as {
    url: string;
    title: string;
    description: string | null;
    image: string | null;
    siteName: string | null;
  };

  const domain = siteName ?? (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  })();

  const isLoading = title === url && !description && !image;

  return (
    <NodeViewWrapper contentEditable={false} data-drag-handle>
      <div
        style={{
          display: 'flex',
          borderRadius: 10,
          overflow: 'hidden',
          margin: '0.75rem 0',
          border: '1px solid var(--notes-border)',
          background: 'var(--notes-surface)',
          cursor: isLoading ? 'default' : 'pointer',
          userSelect: 'none',
          position: 'relative',
          transition: 'opacity 0.15s',
          opacity: isLoading ? 0.6 : 1,
        }}
        onClick={() => !isLoading && window.open(url, '_blank', 'noopener,noreferrer')}
      >
        {image && (
          <img
            src={image}
            alt={title}
            style={{ width: 120, minHeight: 80, objectFit: 'cover', flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div style={{ padding: '0.75rem 1rem', flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--notes-text-subtle)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isLoading ? '⏳ Loading preview...' : domain}
          </div>
          {!isLoading && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--notes-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
              {description && (
                <div style={{ fontSize: 12, color: 'var(--notes-text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                  {description}
                </div>
              )}
            </>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(); }}
          title="Remove preview"
          style={{
            position: 'absolute', top: 6, right: 6, width: 20, height: 20,
            border: 'none', borderRadius: 4, cursor: 'pointer',
            background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)',
            fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const OGPreviewExtension = Node.create({
  name: 'ogPreview',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      image: { default: null },
      siteName: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-og-preview]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-og-preview': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(OGPreviewCard);
  },
});
