'use client';

import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import Modal from './Modal';
import { toast } from 'sonner';

interface Props {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: Props) {
  const templates = useNotesDataStore((s) => s.getTemplates)();
  const deleteTemplate = useNotesDataStore((s) => s.deleteTemplate);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTemplate(id);
    toast.success('Template deleted');
  };

  return (
    <Modal title="📋 Note Templates" onClose={onClose} wide>
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
    </Modal>
  );
}
