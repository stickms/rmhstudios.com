'use client';

import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import Modal from './Modal';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Props {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  const templates = useNotesDataStore((s) => s.getTemplates)();
  const deleteTemplate = useNotesDataStore((s) => s.deleteTemplate);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTemplate(id);
    toast.success(t("template-deleted", { defaultValue: "Template deleted" }));
  };

  return (
    <Modal title={t("note-templates-title", { defaultValue: "📋 Note Templates" })} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {templates.map((tmpl) => (
          <button
            key={tmpl.id}
            onClick={() => onSelect(tmpl.content)}
            className="group text-left p-4 rounded-xl transition-all hover:shadow-md relative"
            style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--notes-accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--notes-border)')}
          >
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--notes-text)' }}>{tmpl.name}</p>
            {tmpl.isBuiltin && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--notes-tag-bg)', color: 'var(--notes-tag-text)' }}>{t("built-in", { defaultValue: "Built-in" })}</span>}
            {!tmpl.isBuiltin && (
              <button
                onClick={(e) => handleDelete(tmpl.id, e)}
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
