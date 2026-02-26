'use client';

import { Note } from './types';
import Modal from './Modal';

interface Props {
  note: Note;
  onClose: () => void;
}

export default function ShareModal({ note, onClose }: Props) {
  return (
    <Modal title="🔗 Share Note" onClose={onClose}>
      <div className="text-center space-y-4 py-4">
        <p className="text-4xl">🔗</p>
        <p className="text-sm font-medium" style={{ color: 'var(--notes-text)' }}>Sharing is not available in offline mode</p>
        <p className="text-xs" style={{ color: 'var(--notes-text-muted)' }}>
          Notes are stored locally in your browser. To share &quot;{note.title || 'Untitled'}&quot;, use the Export feature to download and share the file manually.
        </p>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}
