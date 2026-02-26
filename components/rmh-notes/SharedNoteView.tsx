'use client';

import { useEffect, useState } from 'react';
import { Note } from './types';

interface Props { token: string; }

export default function SharedNoteView({ token }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/rmh-notes/share/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) setError(d.error ?? 'Unable to load note');
        else setNote(d.note);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Render TipTap JSON to HTML
  const renderContent = (content: string): string => {
    try {
      const doc = JSON.parse(content);
      return renderNode(doc);
    } catch { return `<p>${content}</p>`; }
  };

  const renderNode = (node: Record<string, unknown>): string => {
    const type = node.type as string;
    const content = (node.content as Array<Record<string, unknown>>) ?? [];
    const attrs = (node.attrs as Record<string, unknown>) ?? {};
    const children = content.map(renderNode).join('');
    switch (type) {
      case 'doc': return children;
      case 'paragraph': return `<p>${children || '<br>'}</p>`;
      case 'heading': return `<h${attrs.level}>${children}</h${attrs.level}>`;
      case 'text': {
        let text = escapeHtml(node.text as string ?? '');
        const marks = (node.marks as Array<Record<string, unknown>>) ?? [];
        for (const m of marks) {
          const mt = m.type as string;
          if (mt === 'bold') text = `<strong>${text}</strong>`;
          if (mt === 'italic') text = `<em>${text}</em>`;
          if (mt === 'strike') text = `<s>${text}</s>`;
          if (mt === 'code') text = `<code>${text}</code>`;
          if (mt === 'highlight') text = `<mark>${text}</mark>`;
          if (mt === 'link') {
            const rawHref = String((m.attrs as Record<string, unknown>)?.href ?? '');
            const safeHref = /^javascript:/i.test(rawHref) ? '#' : escapeHtml(rawHref);
            text = `<a href="${safeHref}" target="_blank" rel="noopener">${text}</a>`;
          }
        }
        return text;
      }
      case 'hardBreak': return '<br>';
      case 'horizontalRule': return '<hr>';
      case 'bulletList': return `<ul>${children}</ul>`;
      case 'orderedList': return `<ol>${children}</ol>`;
      case 'listItem': return `<li>${children}</li>`;
      case 'taskList': return `<ul class="task-list">${children}</ul>`;
      case 'taskItem': return `<li class="task-item"><input type="checkbox" disabled ${attrs.checked ? 'checked' : ''}> ${children}</li>`;
      case 'blockquote': return `<blockquote>${children}</blockquote>`;
      case 'codeBlock': return `<pre><code>${children}</code></pre>`;
      case 'image': return `<img src="${escapeHtml(String(attrs.src ?? ''))}" alt="${escapeHtml(String(attrs.alt ?? ''))}" style="max-width:100%">`;
      case 'ogPreview': {
        const url = escapeHtml((attrs.url as string) ?? '');
        const title = escapeHtml((attrs.title as string) ?? url);
        const description = attrs.description ? escapeHtml(attrs.description as string) : null;
        const image = attrs.image ? escapeHtml(attrs.image as string) : null;
        const domain = (() => {
          const s = (attrs.siteName as string) ?? '';
          if (s) return escapeHtml(s);
          try { return new URL(attrs.url as string).hostname.replace(/^www\./, ''); } catch { return url; }
        })();
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="og-preview-card">
          ${image ? `<img src="${image}" alt="${title}" class="og-preview-img" onerror="this.style.display='none'">` : ''}
          <div class="og-preview-body">
            <div class="og-preview-domain">${domain}</div>
            <div class="og-preview-title">${title}</div>
            ${description ? `<div class="og-preview-desc">${description}</div>` : ''}
          </div>
        </a>`;
      }
      default: return children;
    }
  };

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FEF9F0' }}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📓</div>
          <p style={{ color: '#7A6451' }}>Loading note...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FEF9F0' }}>
        <div className="text-center max-w-md p-8">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#2C1F0F' }}>{error}</h1>
          <p style={{ color: '#7A6451' }}>This note may have been deleted, locked, or the link has expired.</p>
          <a href="/rmh-notes" className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#C17F3A', color: '#FFFDF8' }}>
            Go to RMHNotes
          </a>
        </div>
      </div>
    );
  }

  if (!note) return null;

  return (
    <div style={{ fontFamily: "'Nunito', ui-sans-serif, sans-serif", background: '#FEF9F0', minHeight: '100vh', color: '#2C1F0F' }}>
      {/* Header */}
      <div style={{ background: '#F5ECD7', borderBottom: '1px solid #E2D3BB', padding: '12px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📓</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#7A6451' }}>RMHNotes — Shared Note</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#A89078' }}>Read-only</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>{note.title}</h1>
        <div style={{ fontSize: 13, color: '#A89078', marginBottom: '1.5rem', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Updated {new Date(note.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          {note.folder && <span>📁 {note.folder.name}</span>}
          {note.tags?.map(({ tag }) => (
            <span key={tag.id} style={{ padding: '2px 8px', borderRadius: 20, background: '#E8F4E3', color: '#3D6B47', border: '1px solid #C5DEBC' }}>
              {tag.name}
            </span>
          ))}
        </div>
        <div
          className="notes-editor"
          style={{ lineHeight: 1.8 }}
          dangerouslySetInnerHTML={{ __html: renderContent(note.content) }}
        />
      </div>

      <style>{`
        .notes-editor h1 { font-size: 1.8em; font-weight: 700; margin: 1em 0 0.5em; }
        .notes-editor h2 { font-size: 1.4em; font-weight: 700; margin: 0.9em 0 0.4em; }
        .notes-editor h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.3em; }
        .notes-editor p { margin: 0.5em 0; }
        .notes-editor code { background: #F7EFE0; padding: 0.1em 0.35em; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .notes-editor pre { background: #F7EFE0; padding: 1em; border-radius: 8px; overflow-x: auto; }
        .notes-editor blockquote { border-left: 3px solid #C17F3A; padding: 0.5em 1em; background: #F5ECD7; border-radius: 0 8px 8px 0; color: #7A6451; font-style: italic; margin: 0.75em 0; }
        .notes-editor ul, .notes-editor ol { padding-left: 1.5em; margin: 0.5em 0; }
        .notes-editor li { margin: 0.2em 0; }
        .notes-editor mark { background: #FFF176; border-radius: 3px; padding: 0 2px; }
        .notes-editor a { color: #C17F3A; text-decoration: underline; }
        .notes-editor hr { border: none; border-top: 2px solid #E2D3BB; margin: 1.5em 0; }
        .task-item { list-style: none; display: flex; align-items: flex-start; gap: 0.5em; }
        .task-list { padding-left: 0.5em; }
        .og-preview-card { display: flex; border-radius: 10px; overflow: hidden; margin: 0.75rem 0; border: 1px solid #E2D3BB; background: #FEF9F0; text-decoration: none; color: inherit; transition: opacity 0.15s; }
        .og-preview-card:hover { opacity: 0.85; }
        .og-preview-img { width: 120px; min-height: 80px; object-fit: cover; flex-shrink: 0; }
        .og-preview-body { padding: 0.75rem 1rem; flex: 1; overflow: hidden; min-width: 0; }
        .og-preview-domain { font-size: 11px; color: #A89078; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .og-preview-title { font-weight: 600; font-size: 14px; color: #2C1F0F; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .og-preview-desc { font-size: 12px; color: #7A6451; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      `}</style>
    </div>
  );
}
