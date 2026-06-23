'use client';

import { useTranslation } from "react-i18next";
import { Note } from './types';
import Modal from './Modal';

interface Props {
  note: Note;
  onClose: () => void;
}

export default function ShareModal({ note, onClose }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  return (
    <Modal title="🔗 Share Note" onClose={onClose}>
      <div className="text-center space-y-4 py-4">
        <p className="text-4xl">🔗</p>
        <p className="text-sm font-medium" style={{ color: 'var(--notes-text)' }}>{t("sharing-unavailable-offline", { defaultValue: "Sharing is not available in offline mode" })}</p>
        <p className="text-xs" style={{ color: 'var(--notes-text-muted)' }}>
          {t("sharing-offline-description", { defaultValue: "Notes are stored locally in your browser. To share \"{{title}}\", use the Export feature to download and share the file manually.", title: note.title || t("untitled", { defaultValue: "Untitled" }) })}
        </p>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
        >
          {t("got-it", { defaultValue: "Got it" })}
        </button>
      </div>
    </Modal>
  );
}
