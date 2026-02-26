'use client';

import { useState } from 'react';
import { Note, NoteReminder } from './types';
import { toast } from 'sonner';
import Modal from './Modal';

interface Props {
  note: Note;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReminderModal({ note, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [repeat, setRepeat] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/rmh-notes/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: note.id, title: title || note.title, dueAt: date, repeatRule: repeat || undefined }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); toast.success('Reminder set!'); }
    else toast.error('Failed to set reminder');
  };

  const handleSnooze = async (reminder: NoteReminder, minutes: number) => {
    const res = await fetch(`/api/rmh-notes/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozeMinutes: minutes }),
    });
    if (res.ok) { onSaved(); toast.success(`Snoozed for ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}`); }
  };

  const handleComplete = async (id: string) => {
    const res = await fetch(`/api/rmh-notes/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: true }),
    });
    if (res.ok) { onSaved(); toast.success('Reminder completed!'); }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/rmh-notes/reminders/${id}`, { method: 'DELETE' });
    if (res.ok) { onSaved(); }
  };

  return (
    <Modal title="🔔 Reminders" onClose={onClose}>
      {/* Existing reminders */}
      {note.reminders.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--notes-text-muted)' }}>Existing reminders:</p>
          {note.reminders.map((r) => {
            const due = new Date(r.dueAt);
            const overdue = due < new Date();
            return (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>
                <span className="text-sm">{overdue ? '⚠️' : '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--notes-text)' }}>{r.title || note.title}</p>
                  <p className="text-xs" style={{ color: overdue ? 'var(--notes-danger)' : 'var(--notes-text-muted)' }}>
                    {due.toLocaleString()} {r.repeatRule && `• ${r.repeatRule}`}
                  </p>
                </div>
                {overdue && (
                  <div className="flex gap-1">
                    {[10, 60, 1440].map((m) => (
                      <button key={m} onClick={() => handleSnooze(r, m)} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--notes-surface-3)', color: 'var(--notes-text-muted)' }}>
                        {m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : '1d'}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => handleComplete(r.id)} title="Mark complete" className="text-sm hover:opacity-70">✓</button>
                <button onClick={() => handleDelete(r.id)} title="Delete" className="text-sm hover:opacity-70" style={{ color: 'var(--notes-danger)' }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* New reminder form */}
      <div className="space-y-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--notes-text-muted)' }}>New reminder:</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={note.title || 'Reminder title...'}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
        />
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
        />
        <select
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
        >
          <option value="">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
          {saving ? 'Saving...' : 'Set Reminder'}
        </button>
      </div>
    </Modal>
  );
}
