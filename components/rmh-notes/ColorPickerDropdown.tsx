'use client';

import { useTranslation } from "react-i18next";
import { NOTE_COLORS } from './types';

interface Props {
  currentColor: string | null;
  onChange: (colorId: string) => void;
  onClose: () => void;
}

export default function ColorPickerDropdown({ currentColor, onChange, onClose }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 flex-wrap"
      style={{ background: 'var(--notes-surface-2)', borderBottom: '1px solid var(--notes-border)' }}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--notes-text-muted)' }}>{t("note-color", { defaultValue: "Note color:" })}</span>
      {NOTE_COLORS.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          title={c.label}
          className="transition-transform hover:scale-110"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: c.bg ?? 'var(--notes-border)',
            border: `2px solid ${currentColor === c.id || (!currentColor && c.id === 'none') ? 'var(--notes-accent)' : 'transparent'}`,
          }}
        />
      ))}
      <button onClick={onClose} className="ml-auto text-xs" style={{ color: 'var(--notes-text-subtle)' }}>✕</button>
    </div>
  );
}
