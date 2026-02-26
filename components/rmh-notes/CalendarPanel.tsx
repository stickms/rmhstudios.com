'use client';

import { useEffect, useState, useCallback } from 'react';
import { NoteReminder } from './types';
import { toast } from 'sonner';

interface Props {
  onSelectNote: (id: string) => void;
}

export default function CalendarPanel({ onSelectNote }: Props) {
  const [reminders, setReminders] = useState<NoteReminder[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'agenda' | 'overdue'>('agenda');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/rmh-notes/reminders?view=all');
    if (res.ok) setReminders((await res.json()).reminders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (id: string) => {
    const res = await fetch(`/api/rmh-notes/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: true }),
    });
    if (res.ok) { load(); toast.success('Reminder completed!'); }
  };

  const handleSnooze = async (id: string, minutes: number) => {
    const res = await fetch(`/api/rmh-notes/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozeMinutes: minutes }),
    });
    if (res.ok) { load(); toast.success(`Snoozed ${minutes < 60 ? minutes + 'm' : minutes / 60 + 'h'}`); }
  };

  const now = new Date();
  const overdue = reminders.filter((r) => !r.isCompleted && new Date(r.dueAt) < now && (!r.snoozedUntil || new Date(r.snoozedUntil) < now));
  const upcoming = reminders.filter((r) => !r.isCompleted && new Date(r.dueAt) >= now);

  // Calendar helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const remindersOnDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return reminders.filter((r) => r.dueAt.startsWith(dateStr));
  };

  const ReminderItem = ({ r }: { r: NoteReminder }) => {
    const isOver = new Date(r.dueAt) < now;
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl transition-all" style={{ background: 'var(--notes-surface-2)', border: `1px solid ${isOver ? 'var(--notes-danger)' : 'var(--notes-border)'}` }}>
        <span className="text-lg mt-0.5">{isOver ? '⚠️' : '🔔'}</span>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => r.note && onSelectNote(r.note.id)}
            className="font-semibold text-sm hover:underline text-left block truncate"
            style={{ color: 'var(--notes-text)' }}
          >
            {r.title ?? r.note?.title ?? 'Reminder'}
          </button>
          <p className="text-xs mt-0.5" style={{ color: isOver ? 'var(--notes-danger)' : 'var(--notes-text-muted)' }}>
            {new Date(r.dueAt).toLocaleString()} {r.repeatRule && `• ${r.repeatRule}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {isOver && [10, 60].map((m) => (
            <button key={m} onClick={() => handleSnooze(r.id, m)} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--notes-surface-3)', color: 'var(--notes-text-muted)' }}>
              +{m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
          <button onClick={() => handleComplete(r.id)} title="Mark done" className="text-sm px-1.5 py-0.5 rounded" style={{ background: 'var(--notes-success)', color: '#fff' }}>✓</button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--notes-surface)' }}>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--notes-text)' }}>📅 Reminders</h2>
        <div className="flex gap-1 ml-auto">
          {(['agenda', 'calendar', 'overdue'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize"
              style={{
                background: view === v ? 'var(--notes-accent)' : 'var(--notes-surface-2)',
                color: view === v ? 'var(--notes-accent-fg)' : 'var(--notes-text-muted)',
              }}
            >
              {v === 'agenda' ? '📋 Agenda' : v === 'calendar' ? '📅 Calendar' : '⚠️ Overdue'}
              {v === 'overdue' && overdue.length > 0 && (
                <span className="ml-1 px-1 rounded-full text-xs" style={{ background: 'var(--notes-danger)', color: '#fff' }}>{overdue.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--notes-text-muted)' }}>Loading...</div>
      ) : view === 'agenda' ? (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notes-danger)' }}>Overdue ({overdue.length})</p>
              {overdue.map((r) => <ReminderItem key={r.id} r={r} />)}
              <div className="h-3" />
            </>
          )}
          {upcoming.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notes-text-subtle)' }}>Upcoming ({upcoming.length})</p>
              {upcoming.map((r) => <ReminderItem key={r.id} r={r} />)}
            </>
          ) : overdue.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-sm font-medium" style={{ color: 'var(--notes-text-muted)' }}>You&apos;re all caught up!</p>
              <p className="text-xs mt-1" style={{ color: 'var(--notes-text-subtle)' }}>No upcoming reminders</p>
            </div>
          ) : null}
        </div>
      ) : view === 'overdue' ? (
        <div className="space-y-2">
          {overdue.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-sm font-medium" style={{ color: 'var(--notes-text-muted)' }}>No overdue reminders!</p>
            </div>
          ) : overdue.map((r) => <ReminderItem key={r.id} r={r} />)}
        </div>
      ) : (
        // Calendar view
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentMonth((m) => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })} className="text-sm px-2 py-1 rounded" style={{ color: 'var(--notes-text-muted)' }}>◀</button>
            <h3 className="font-semibold" style={{ color: 'var(--notes-text)' }}>
              {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setCurrentMonth((m) => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })} className="text-sm px-2 py-1 rounded" style={{ color: 'var(--notes-text-muted)' }}>▶</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-xs font-semibold py-1" style={{ color: 'var(--notes-text-subtle)' }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const rs = remindersOnDay(day);
              const isToday = now.getDate() === day && now.getMonth() === month && now.getFullYear() === year;
              return (
                <div
                  key={day}
                  className="rounded-xl p-1 text-center min-h-[52px] flex flex-col items-center gap-0.5"
                  style={{
                    background: isToday ? 'var(--notes-accent)' : rs.length > 0 ? 'var(--notes-surface-2)' : 'transparent',
                    border: `1px solid ${isToday ? 'var(--notes-accent)' : rs.length > 0 ? 'var(--notes-border)' : 'transparent'}`,
                  }}
                >
                  <span className="text-xs font-semibold" style={{ color: isToday ? 'var(--notes-accent-fg)' : 'var(--notes-text)' }}>{day}</span>
                  {rs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => r.note && onSelectNote(r.note.id)}
                      className="w-full text-center truncate rounded px-0.5"
                      style={{ fontSize: 9, background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)', lineHeight: 1.5 }}
                      title={r.title ?? r.note?.title}
                    >
                      🔔
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
