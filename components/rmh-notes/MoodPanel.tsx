'use client';

import { useEffect, useState } from 'react';
import { MOOD_OPTIONS } from './types';
import { toast } from 'sonner';

interface MoodEntry {
  id: string;
  emoji: string;
  color: string;
  note: string | null;
  date: string;
}

export default function MoodPanel() {
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [todayMood, setTodayMood] = useState<MoodEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMood, setSelectedMood] = useState<typeof MOOD_OPTIONS[number] | null>(null);
  const [moodNote, setMoodNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/rmh-notes/mood');
    if (res.ok) {
      const d = await res.json();
      setMoods(d.moods ?? []);
      setTodayMood(d.todayMood ?? null);
      if (d.todayMood) {
        const option = MOOD_OPTIONS.find((m) => m.emoji === d.todayMood.emoji);
        if (option) setSelectedMood(option);
        setMoodNote(d.todayMood.note ?? '');
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveMood = async () => {
    if (!selectedMood) return;
    setSaving(true);
    const res = await fetch('/api/rmh-notes/mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: selectedMood.emoji, color: selectedMood.color, note: moodNote || null }),
    });
    setSaving(false);
    if (res.ok) { await load(); toast.success('Mood logged! 🌈'); }
  };

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--notes-surface)' }}>
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--notes-text)' }}>🌈 Mood Journal</h2>

      {/* Today's check-in */}
      <div className="rounded-2xl p-5 mb-8" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--notes-text)' }}>How are you feeling today?</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--notes-text-subtle)' }}>{todayLabel}</p>

        <div className="flex gap-3 flex-wrap mb-4">
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={mood.emoji}
              onClick={() => setSelectedMood(mood)}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl transition-all"
              style={{
                background: selectedMood?.emoji === mood.emoji ? mood.color + '33' : 'var(--notes-surface)',
                border: `2px solid ${selectedMood?.emoji === mood.emoji ? mood.color : 'var(--notes-border)'}`,
                transform: selectedMood?.emoji === mood.emoji ? 'scale(1.1)' : undefined,
              }}
            >
              <span className="text-2xl">{mood.emoji}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--notes-text-muted)' }}>{mood.label}</span>
            </button>
          ))}
        </div>

        {selectedMood && (
          <>
            <textarea
              value={moodNote}
              onChange={(e) => setMoodNote(e.target.value)}
              placeholder="What's on your mind? (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
            />
            <button
              onClick={saveMood}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: selectedMood.color, color: '#fff' }}
            >
              {saving ? 'Saving...' : todayMood ? '✓ Update mood' : '✓ Log mood'}
            </button>
          </>
        )}
      </div>

      {/* Mood history */}
      {moods.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--notes-text-muted)' }}>Recent moods</h3>
          <div className="flex gap-2 flex-wrap">
            {moods.slice(0, 30).map((m) => (
              <div
                key={m.id}
                className="flex flex-col items-center p-2 rounded-xl"
                style={{ background: m.color + '22', border: `1px solid ${m.color}44` }}
                title={`${new Date(m.date).toLocaleDateString()} — ${m.note ?? ''}`}
              >
                <span className="text-xl">{m.emoji}</span>
                <span className="text-xs mt-1" style={{ color: 'var(--notes-text-subtle)' }}>
                  {new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && moods.length === 0 && (
        <div className="text-center py-8">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Start tracking your mood daily</p>
        </div>
      )}
    </div>
  );
}
