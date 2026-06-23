'use client';

import { useTranslation } from "react-i18next";
import { NoteFolder } from './types';

interface Props {
  currentFolderId: string | null;
  folders: NoteFolder[];
  onChange: (folderId: string | null) => void;
  onClose: () => void;
}

export default function FolderSelector({ currentFolderId, folders, onChange, onClose }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  return (
    <div className="px-4 py-2.5" style={{ background: 'var(--notes-surface-2)', borderBottom: '1px solid var(--notes-border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium" style={{ color: 'var(--notes-text-muted)' }}>{t("folder-label", { defaultValue: "Folder:" })}</span>
        <button
          onClick={() => onChange(null)}
          className="text-xs px-2 py-0.5 rounded-full transition-all"
          style={{
            background: !currentFolderId ? 'var(--notes-surface-3)' : 'transparent',
            color: 'var(--notes-text-muted)',
            border: `1px solid ${!currentFolderId ? 'var(--notes-border-hover)' : 'var(--notes-border)'}`,
          }}
        >
          {!currentFolderId ? '✓ ' : ''}{t("no-folder", { defaultValue: "No folder" })}
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className="text-xs px-2 py-0.5 rounded-full transition-all"
            style={{
              background: currentFolderId === f.id ? 'var(--notes-surface-3)' : 'transparent',
              color: 'var(--notes-text-muted)',
              border: `1px solid ${currentFolderId === f.id ? 'var(--notes-border-hover)' : 'var(--notes-border)'}`,
            }}
          >
            {currentFolderId === f.id ? '✓ ' : ''}📁 {f.name}
          </button>
        ))}
        <button onClick={onClose} className="ml-auto text-xs" style={{ color: 'var(--notes-text-subtle)' }}>✕</button>
      </div>
    </div>
  );
}
