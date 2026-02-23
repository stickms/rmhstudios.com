'use client';

import { useState } from 'react';
import { NoteTag } from './types';
import { toast } from 'sonner';

interface Props {
  noteTagIds: string[];
  allTags: NoteTag[];
  onChange: (tagIds: string[]) => void;
  onClose: () => void;
}

const TAG_COLORS = ['#C17F3A', '#D95B3A', '#3D7A4F', '#5B8FD6', '#8B6FC0', '#E6A817', '#94A3B8'];

export default function TagEditor({ noteTagIds, allTags, onChange, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(noteTagIds);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    setSelected(next);
    onChange(next);
  };

  const createAndAdd = async () => {
    if (!newTagName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/rmh-notes/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName.trim(), color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] }),
    });
    setCreating(false);
    if (res.ok) {
      const { tag } = await res.json();
      const next = [...selected, tag.id];
      setSelected(next);
      onChange(next);
      setNewTagName('');
      toast.success(`Tag "${tag.name}" created`);
    }
  };

  return (
    <div className="px-4 py-2.5" style={{ background: 'var(--notes-surface-2)', borderBottom: '1px solid var(--notes-border)' }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--notes-text-muted)' }}>Tags:</span>
        {allTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => toggle(tag.id)}
            className="text-xs px-2 py-0.5 rounded-full transition-all"
            style={{
              background: selected.includes(tag.id) ? 'var(--notes-tag-bg)' : 'var(--notes-surface-3)',
              color: selected.includes(tag.id) ? 'var(--notes-tag-text)' : 'var(--notes-text-muted)',
              border: `1px solid ${selected.includes(tag.id) ? 'var(--notes-tag-border)' : 'var(--notes-border)'}`,
              fontWeight: selected.includes(tag.id) ? 600 : 400,
            }}
          >
            {selected.includes(tag.id) ? '✓ ' : ''}{tag.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd(); }}
          placeholder="New tag..."
          className="text-xs px-2 py-1 rounded-md outline-none flex-1"
          style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
        />
        <button
          onClick={createAndAdd}
          disabled={creating}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
        >
          {creating ? '...' : '+ Tag'}
        </button>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>✕</button>
      </div>
    </div>
  );
}
