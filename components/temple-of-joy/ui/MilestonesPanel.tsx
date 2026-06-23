'use client';
import { useTranslation } from "react-i18next";
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { MILESTONES } from '@/lib/temple-of-joy/data/milestones';
import { fmt } from '@/lib/temple-of-joy/numbers';

export default function MilestonesPanel() {
  const milestonesReached = useTempleStore((s) => s.milestones);
  const lifetimeHappiness = useTempleStore((s) => s.lifetimeHappiness);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const theme = useTempleStore((s) => s.theme);

  const { t } = useTranslation("c-temple-of-joy");

  const dark = theme === 'dark';

  const reached = MILESTONES.filter((m) => milestonesReached.has(m.id));
  const upcoming = MILESTONES.filter((m) => !milestonesReached.has(m.id));
  const nextMilestone = upcoming[0] ?? null;

  const total = MILESTONES.length;
  const reachedCount = reached.length;

  const formatReward = (m: (typeof MILESTONES)[0]) => {
    if (m.hpsBonus != null) return `+${m.hpsBonus} HPS`;
    if (m.hpsMultiplier != null) return `×${m.hpsMultiplier} HPS`;
    return '';
  };

  return (
    <div
      className="p-4"
      style={{ color: dark ? '#e8d5b0' : '#3d2c1e' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-serif font-bold">⛩️ {t("milestones", { defaultValue: "Milestones" })}</h2>
        <span
          className="text-sm font-semibold px-3 py-1 rounded-full"
          style={{
            background: dark ? '#2c1d12' : '#ede7d9',
            color: dark ? '#d4a847' : '#8b6914',
            border: `1px solid ${dark ? '#6b4c2a' : '#c4a97a'}`,
          }}
        >
          {reachedCount} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 rounded-full mb-4 overflow-hidden"
        style={{ background: dark ? '#2c1d12' : '#ede7d9' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(reachedCount / total) * 100}%`,
            background: dark ? '#d4a847' : '#8b6914',
          }}
        />
      </div>

      {/* Next milestone */}
      {nextMilestone && (
        <div
          className="rounded-xl p-3 mb-5 text-sm border"
          style={{
            background: dark ? '#2c1d12' : '#f5f0e8',
            borderColor: dark ? '#6b4c2a' : '#c4a97a',
          }}
        >
          <span className="opacity-60 text-xs font-medium uppercase tracking-wide">{t("next", { defaultValue: "Next" })}</span>
          <p className="font-semibold mt-0.5">
            {nextMilestone.label}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs opacity-70">
              {fmt(nextMilestone.threshold, numberFormat)} {t("lifetime-happiness", { defaultValue: "lifetime happiness" })}
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: dark ? '#d4a847' : '#8b6914' }}
            >
              {formatReward(nextMilestone)}
            </span>
          </div>
          {/* Progress toward next */}
          <div
            className="h-1 rounded-full mt-2 overflow-hidden"
            style={{ background: dark ? '#1a120b' : '#e5dcc7' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (lifetimeHappiness / nextMilestone.threshold) * 100)}%`,
                background: dark ? '#d4a847' : '#8b6914',
              }}
            />
          </div>
        </div>
      )}

      {/* Reached section */}
      {reached.length > 0 && (
        <section className="mb-4">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-60"
          >
            {t("reached", { defaultValue: "Reached" })}
          </h3>
          <div className="space-y-2">
            {[...reached].reverse().map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                style={{
                  background: dark ? '#2c1d12' : '#f5f0e8',
                  borderLeft: `3px solid ${dark ? '#d4a847' : '#8b6914'}`,
                }}
              >
                <span className="font-medium">✓ {m.label}</span>
                <div className="text-right">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: dark ? '#d4a847' : '#8b6914' }}
                  >
                    {formatReward(m)}
                  </span>
                  <span className="block text-xs opacity-45">
                    {fmt(m.threshold, numberFormat)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming section */}
      {upcoming.length > 0 && (
        <section>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-60"
          >
            {t("upcoming", { defaultValue: "Upcoming" })}
          </h3>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm opacity-45"
                style={{
                  background: dark ? '#1a120b' : '#ede7d9',
                  borderLeft: `3px solid ${dark ? '#3d2c1e' : '#d5c9b0'}`,
                }}
              >
                <span>{m.label}</span>
                <div className="text-right">
                  <span className="text-xs font-semibold">{formatReward(m)}</span>
                  <span className="block text-xs opacity-60">
                    {fmt(m.threshold, numberFormat)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
