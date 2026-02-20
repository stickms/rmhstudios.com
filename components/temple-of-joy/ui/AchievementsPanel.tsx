'use client';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { ACHIEVEMENTS } from '@/lib/temple-of-joy/data/achievements';

export default function AchievementsPanel() {
  const achievements = useTempleStore((s) => s.achievements);
  const theme = useTempleStore((s) => s.theme);

  const dark = theme === 'dark';

  const total = ACHIEVEMENTS.length;
  const unlockedCount = achievements.size;

  // Sort: unlocked first, then visible locked, then hidden locked
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const aUnlocked = achievements.has(a.id);
    const bUnlocked = achievements.has(b.id);
    if (aUnlocked && !bUnlocked) return -1;
    if (!aUnlocked && bUnlocked) return 1;
    // Both locked — visible before hidden
    if (!a.hidden && b.hidden) return -1;
    if (a.hidden && !b.hidden) return 1;
    return 0;
  });

  return (
    <div
      className="p-4"
      style={{ color: dark ? '#e8d5b0' : '#3d2c1e' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-serif font-bold">
          🏆 Achievements
        </h2>
        <span
          className="text-sm font-semibold px-3 py-1 rounded-full"
          style={{
            background: dark ? '#2c1d12' : '#ede7d9',
            color: dark ? '#d4a847' : '#8b6914',
            border: `1px solid ${dark ? '#6b4c2a' : '#c4a97a'}`,
          }}
        >
          {unlockedCount} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 rounded-full mb-5 overflow-hidden"
        style={{ background: dark ? '#2c1d12' : '#ede7d9' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(unlockedCount / total) * 100}%`,
            background: dark ? '#d4a847' : '#8b6914',
          }}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((ach) => {
          const unlocked = achievements.has(ach.id);
          const hidden = ach.hidden && !unlocked;

          return (
            <div
              key={ach.id}
              className="rounded-xl p-3 border transition-opacity"
              style={{
                background: dark ? '#2c1d12' : '#f5f0e8',
                borderColor: unlocked
                  ? (dark ? '#d4a847' : '#8b6914')
                  : (dark ? '#3d2c1e' : '#ddd0bb'),
                borderWidth: unlocked ? '2px' : '1px',
              opacity: hidden ? 0.38 : !unlocked ? 0.55 : 1,
              }}
            >
              {hidden ? (
                <>
                  <p className="font-semibold text-sm flex items-center gap-1.5 opacity-50">
                    <span>🔒</span><span>???</span>
                  </p>
                  <p className="text-xs opacity-35 mt-0.5">???</p>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p
                      className="font-semibold text-sm"
                      style={{ color: unlocked ? (dark ? '#d4a847' : '#8b6914') : undefined }}
                    >
                      {unlocked ? '🏆' : '🔒'} {ach.name}
                    </p>
                  </div>
                  <p className="text-xs opacity-70 leading-snug">{ach.description}</p>
                  {unlocked && ach.flavor && (
                    <p
                      className="text-xs italic mt-1.5 opacity-60"
                      style={{ color: dark ? '#d4a847' : '#8b6914' }}
                    >
                      &ldquo;{ach.flavor}&rdquo;
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
