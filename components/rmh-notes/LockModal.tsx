'use client';

import { useState } from 'react';
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
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLock = async () => {
    if (password.length < 1) { setError('Password cannot be empty'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const res = await fetch(`/api/rmh-notes/notes/${note.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lock', password }),
    });
    setLoading(false);
    if (res.ok) { toast.success('Note locked'); onSuccess(); }
    else setError('Failed to lock note');
  };

  const handleUnlock = async () => {
    if (!password) { setError('Enter your password'); return; }
    setLoading(true);
    const res = await fetch(`/api/rmh-notes/notes/${note.id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', password }),
    });
    setLoading(false);
    if (res.ok) { toast.success('Note unlocked'); onSuccess(); }
    else { const d = await res.json(); setError(d.error ?? 'Incorrect password'); }
  };

  const handleVerify = async () => {
    if (!password) { setError('Enter your password'); return; }
    setLoading(true);
    const res = await fetch(`/api/rmh-notes/notes/${note.id}/lock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) { onSuccess(); }
    else { const d = await res.json(); setError(d.error ?? 'Incorrect password'); }
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
            <button onClick={handleVerify} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
              {loading ? 'Checking...' : 'Unlock'}
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
            <button onClick={handleUnlock} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-danger)', color: '#fff' }}>
              {loading ? 'Unlocking...' : 'Remove Lock'}
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
          <button onClick={handleLock} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            {loading ? 'Locking...' : 'Lock Note'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
