'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { Note } from './types';
import { toast } from 'sonner';
import Modal from './Modal';

interface Props {
  note: Note;
  mode: 'set' | 'manage' | 'unlock';
  onSuccess: () => void;
  onClose: () => void;
  onNoteUpdate: (note: Note) => void;
}

export default function LockModal({ note, mode, onSuccess, onClose, onNoteUpdate }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  const dataStore = useNotesDataStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleLock = () => {
    if (password.length < 1) { setError(t("password-cannot-be-empty", { defaultValue: "Password cannot be empty" })); return; }
    if (password !== confirm) { setError(t("passwords-do-not-match", { defaultValue: "Passwords do not match" })); return; }
    const success = dataStore.lockNote(note.id, password);
    if (success) {
      const updated = dataStore.getNote(note.id);
      if (updated) onNoteUpdate(updated);
      toast.success(t("note-locked", { defaultValue: "Note locked" }));
      onSuccess();
    } else {
      setError(t("failed-to-lock-note", { defaultValue: "Failed to lock note" }));
    }
  };

  const handleUnlock = () => {
    if (!password) { setError(t("enter-your-password", { defaultValue: "Enter your password" })); return; }
    const success = dataStore.unlockNote(note.id, password);
    if (success) {
      const updated = dataStore.getNote(note.id);
      if (updated) onNoteUpdate(updated);
      toast.success(t("note-unlocked", { defaultValue: "Note unlocked" }));
      onSuccess();
    } else {
      setError(t("incorrect-password", { defaultValue: "Incorrect password" }));
    }
  };

  const handleVerify = () => {
    if (!password) { setError(t("enter-your-password", { defaultValue: "Enter your password" })); return; }
    const success = dataStore.verifyLock(note.id, password);
    if (success) {
      onSuccess();
    } else {
      setError(t("incorrect-password", { defaultValue: "Incorrect password" }));
    }
  };

  if (mode === 'unlock') {
    return (
      <Modal title="🔒 Unlock Note" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>{t("enter-password-to-unlock", { defaultValue: "Enter your password to unlock this note." })}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            autoFocus
            placeholder={t("password-placeholder", { defaultValue: "Password..." })}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
          />
          {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>{t("cancel", { defaultValue: "Cancel" })}</button>
            <button onClick={handleVerify} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
              {t("unlock", { defaultValue: "Unlock" })}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (mode === 'manage' && note.isLocked) {
    return (
      <Modal title="🔒 Manage Lock" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>{t("enter-current-password-to-unlock", { defaultValue: "Enter your current password to unlock this note." })}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
            placeholder={t("current-password-placeholder", { defaultValue: "Current password..." })}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
          />
          {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>{t("cancel", { defaultValue: "Cancel" })}</button>
            <button onClick={handleUnlock} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-danger)', color: '#fff' }}>
              {t("remove-lock", { defaultValue: "Remove Lock" })}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="🔒 Lock Note" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>{t("set-password-description", { defaultValue: "Set a password to lock this note. You'll need it to view the contents." })}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          autoFocus
          placeholder={t("password-placeholder", { defaultValue: "Password..." })}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleLock()}
          placeholder={t("confirm-password-placeholder", { defaultValue: "Confirm password..." })}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
        />
        {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>{t("cancel", { defaultValue: "Cancel" })}</button>
          <button onClick={handleLock} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            {t("lock-note", { defaultValue: "Lock Note" })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
