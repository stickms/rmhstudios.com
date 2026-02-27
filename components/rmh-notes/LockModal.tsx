'use client';

import { useState } from 'react';
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
  const dataStore = useNotesDataStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleLock = () => {
    if (password.length < 1) { setError('Password cannot be empty'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    const success = dataStore.lockNote(note.id, password);
    if (success) {
      const updated = dataStore.getNote(note.id);
      if (updated) onNoteUpdate(updated);
      toast.success('Note locked');
      onSuccess();
    } else {
      setError('Failed to lock note');
    }
  };

  const handleUnlock = () => {
    if (!password) { setError('Enter your password'); return; }
    const success = dataStore.unlockNote(note.id, password);
    if (success) {
      const updated = dataStore.getNote(note.id);
      if (updated) onNoteUpdate(updated);
      toast.success('Note unlocked');
      onSuccess();
    } else {
      setError('Incorrect password');
    }
  };

  const handleVerify = () => {
    if (!password) { setError('Enter your password'); return; }
    const success = dataStore.verifyLock(note.id, password);
    if (success) {
      onSuccess();
    } else {
      setError('Incorrect password');
    }
  };

  if (mode === 'unlock') {
    return (
      <Modal title="🔒 Unlock Note" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Enter your password to unlock this note.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            autoFocus
            placeholder="Password..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
          />
          {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>Cancel</button>
            <button onClick={handleVerify} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
              Unlock
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
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Enter your current password to unlock this note.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
            placeholder="Current password..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
          />
          {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>Cancel</button>
            <button onClick={handleUnlock} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-danger)', color: '#fff' }}>
              Remove Lock
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="🔒 Lock Note" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Set a password to lock this note. You&apos;ll need it to view the contents.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          autoFocus
          placeholder="Password..."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleLock()}
          placeholder="Confirm password..."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: `1px solid ${error ? 'var(--notes-danger)' : 'var(--notes-border)'}`, color: 'var(--notes-text)' }}
        />
        {error && <p className="text-xs" style={{ color: 'var(--notes-danger)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>Cancel</button>
          <button onClick={handleLock} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            Lock Note
          </button>
        </div>
      </div>
    </Modal>
  );
}
