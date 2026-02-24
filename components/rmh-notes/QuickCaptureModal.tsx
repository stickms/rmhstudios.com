'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  onSave: (title: string, content: string) => Promise<void>;
  onClose: () => void;
}

export default function QuickCaptureModal({ onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) { onClose(); return; }
    setSaving(true);
    const docContent = JSON.stringify({
      type: 'doc',
      content: content.trim().split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      })),
    });
    await onSave(title.trim() || 'Quick note', docContent);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick capture header */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--notes-border)' }}>
          <span className="text-lg">✦</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="flex-1 text-sm font-semibold bg-transparent outline-none"
            style={{ color: 'var(--notes-text)' }}
          />
          <button onClick={onClose} className="text-sm opacity-40 hover:opacity-70" style={{ color: 'var(--notes-text)' }}>✕</button>
        </div>

        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Capture your thought..."
          rows={5}
          className="w-full px-4 py-3 text-sm bg-transparent outline-none resize-none"
          style={{ color: 'var(--notes-text)' }}
        />

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--notes-border)' }}>
          <p className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
            <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>⌘↵</kbd> to save
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
            >
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
