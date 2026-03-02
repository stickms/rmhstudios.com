'use client';

import { useNotesDataStore } from '@/lib/store/useNotesDataStore';

export default function StatsPanel() {
  const getStats = useNotesDataStore((s) => s.getStats);
  const stats = getStats();

  // Build last 28 days heatmap
  const days: { date: string; count: number }[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    days.push({ date: key, count: stats.notesPerDay[key] ?? 0 });
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  const Card = ({ icon, label, value, sub }: { icon: string; label: string; value: number | string; sub?: string }) => (
    <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>
      <span className="text-2xl">{icon}</span>
      <span className="text-2xl font-bold" style={{ color: 'var(--notes-text)' }}>{value}</span>
      <span className="text-xs font-medium" style={{ color: 'var(--notes-text-muted)' }}>{label}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>{sub}</span>}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--notes-surface)' }}>
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--notes-text)' }}>📊 Statistics</h2>

      {/* Streak banner */}
      {stats.streak > 0 && (
        <div className="rounded-2xl p-4 mb-6 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, var(--notes-accent), var(--notes-accent-hover))', color: 'var(--notes-accent-fg)' }}>
          <span className="text-4xl">🔥</span>
          <div>
            <p className="text-2xl font-bold">{stats.streak} day streak!</p>
            <p className="text-sm opacity-80">Keep writing every day to maintain your streak</p>
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        <Card icon="📄" label="Total Notes" value={stats.totalNotes} />
        <Card icon="📝" label="This Week" value={stats.weekNotes} sub="+notes created" />
        <Card icon="📌" label="Pinned" value={stats.pinnedCount} />
        <Card icon="⭐" label="Favorites" value={stats.totalNotes > 0 ? stats.pinnedCount : 0} />
        <Card icon="🔔" label="Reminders" value={stats.remindersTotal} sub={`${stats.remindersCompleted} completed`} />
        {stats.overdueCount > 0 && <Card icon="⚠️" label="Overdue" value={stats.overdueCount} sub="need attention" />}
        <Card icon="🏷️" label="Tags" value={stats.tagsCount} />
        <Card icon="📁" label="Folders" value={stats.foldersCount} />
        <Card icon="📦" label="Archived" value={stats.archivedCount} />
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>
        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--notes-text-muted)' }}>Last 28 days</h3>
        <div className="flex gap-1.5 flex-wrap">
          {days.map((d) => {
            const intensity = d.count === 0 ? 0 : Math.ceil((d.count / maxCount) * 4);
            const bgColors = ['var(--notes-border)', '#F5C86A', '#E8A840', '#D4862A', '#C17F3A'];
            return (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} note${d.count !== 1 ? 's' : ''}`}
                className="rounded-sm transition-all hover:scale-125 cursor-default"
                style={{ width: 14, height: 14, background: bgColors[intensity] }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
          <span>Less</span>
          {['var(--notes-border)', '#F5C86A', '#E8A840', '#D4862A', '#C17F3A'].map((c, i) => (
            <div key={i} className="rounded-sm" style={{ width: 12, height: 12, background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
