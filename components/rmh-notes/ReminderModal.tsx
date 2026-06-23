'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { Note, NoteReminder } from './types';
import { toast } from 'sonner';
import Modal from './Modal';

interface Props {
  note: Note;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReminderModal({ note, onClose, onSaved }: Props) {
  const { t } = useTranslation("c-rmh-notes");
  const dataStore = useNotesDataStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [repeat, setRepeat] = useState<string>('');

  const handleSave = () => {
    dataStore.createReminder({
      noteId: note.id,
      title: title || note.title,
      dueAt: date,
      repeatRule: repeat || undefined,
    });
    onSaved();
    onClose();
    toast.success(t("reminder-set", { defaultValue: "Reminder set!" }));
  };

  const handleSnooze = (reminder: NoteReminder, minutes: number) => {
    dataStore.updateReminder(reminder.id, { snoozeMinutes: minutes } as Record<string, unknown>);
    onSaved();
    toast.success(t("snoozed-for", { duration: minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`, defaultValue: "Snoozed for {{duration}}" }));
  };

  const handleComplete = (id: string) => {
    dataStore.updateReminder(id, { isCompleted: true });
    onSaved();
    toast.success(t("reminder-completed", { defaultValue: "Reminder completed!" }));
  };

  const handleDelete = (id: string) => {
    dataStore.deleteReminder(id);
    onSaved();
  };

  return (
    <Modal title={`🔔 ${t("reminders", { defaultValue: "Reminders" })}`} onClose={onClose}>
      {/* Existing reminders */}
      {note.reminders.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--notes-text-muted)' }}>{t("existing-reminders", { defaultValue: "Existing reminders:" })}</p>
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
                <button onClick={() => handleComplete(r.id)} title={t("mark-complete", { defaultValue: "Mark complete" })} className="text-sm hover:opacity-70">✓</button>
                <button onClick={() => handleDelete(r.id)} title={t("delete", { defaultValue: "Delete" })} className="text-sm hover:opacity-70" style={{ color: 'var(--notes-danger)' }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* New reminder form */}
      <div className="space-y-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--notes-text-muted)' }}>{t("new-reminder", { defaultValue: "New reminder:" })}</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={note.title || t("reminder-title-placeholder", { defaultValue: "Reminder title..." })}
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
          <option value="">{t("no-repeat", { defaultValue: "No repeat" })}</option>
          <option value="daily">{t("daily", { defaultValue: "Daily" })}</option>
          <option value="weekly">{t("weekly", { defaultValue: "Weekly" })}</option>
          <option value="monthly">{t("monthly", { defaultValue: "Monthly" })}</option>
        </select>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>{t("cancel", { defaultValue: "Cancel" })}</button>
        <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
          {t("set-reminder", { defaultValue: "Set Reminder" })}
        </button>
      </div>
    </Modal>
  );
}
