'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { toast } from 'sonner';

interface Template { id: string; name: string; content: string; isBuiltin: boolean; }

interface Props {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rmh-notes/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/rmh-notes/templates/${id}`, { method: 'DELETE' });
    if (res.ok) { setTemplates((prev) => prev.filter((t) => t.id !== id)); toast.success('Template deleted'); }
  };

  return (
    <Modal title="📋 Note Templates" onClose={onClose} wide>
      {loading ? (
        <div className="text-center py-8" style={{ color: 'var(--notes-text-muted)' }}>Loading...</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.content)}
              className="group text-left p-4 rounded-xl transition-all hover:shadow-md relative"
              style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--notes-accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--notes-border)')}
            >
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--notes-text)' }}>{t.name}</p>
              {t.isBuiltin && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--notes-tag-bg)', color: 'var(--notes-tag-text)' }}>Built-in</span>}
              {!t.isBuiltin && (
                <button
                  onClick={(e) => handleDelete(t.id, e)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 hover:opacity-100! text-xs"
                  style={{ color: 'var(--notes-danger)' }}
                >✕</button>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
