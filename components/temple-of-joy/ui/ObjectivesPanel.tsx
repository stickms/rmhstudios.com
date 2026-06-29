'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { OBJECTIVES } from '@/lib/temple-of-joy/data/objectives';
import type { ObjectiveDef } from '@/lib/temple-of-joy/types';

const CATEGORY_LABEL: Record<ObjectiveDef['category'], string> = {
  milestone: 'Milestones',
  mastery: 'Mastery',
  challenge: 'Challenges',
  eternal: 'Eternal',
};

function rewardText(o: ObjectiveDef): string {
  const parts: string[] = [];
  if (o.reward.radiance) parts.push(`+${o.reward.radiance} ☀️`);
  if (o.reward.blissShards) parts.push(`+${o.reward.blissShards} 💎`);
  if (o.reward.karma) parts.push(`+${o.reward.karma} ☯️`);
  return parts.join('  ');
}

export default function ObjectivesPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const completed = useTempleStore((s) => s.completedObjectives);

  const done = completed.size;
  const total = OBJECTIVES.length;
  const categories = [...new Set(OBJECTIVES.map((o) => o.category))];

  return (
    <div className="flex flex-col gap-4" style={{ color: 'var(--temple-text)' }}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--temple-accent)' }}>
          🎯 {t('objectives', { defaultValue: 'Objectives' })}
        </h2>
        <span className="text-xs tabular-nums" style={{ opacity: 0.7 }}>{done} / {total}</span>
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--temple-accent)', opacity: 0.8 }}>
            {t(`objective-cat-${cat}`, { defaultValue: CATEGORY_LABEL[cat] })}
          </h3>
          <div className="flex flex-col gap-2">
            {OBJECTIVES.filter((o) => o.category === cat).map((o) => {
              const isDone = completed.has(o.id);
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{
                    background: 'var(--temple-surface)',
                    border: isDone ? '1px solid var(--temple-accent)' : '1px solid var(--temple-border)',
                    opacity: isDone ? 1 : 0.92,
                  }}
                >
                  <span className="text-lg shrink-0">{isDone ? '✅' : '⬜'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight" style={{ color: isDone ? 'var(--temple-accent-bright, #f0c84a)' : 'var(--temple-text)' }}>
                      {o.name}
                    </p>
                    <p className="text-[11px] leading-snug" style={{ opacity: 0.6 }}>{o.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: 'var(--temple-accent)' }}>
                    {rewardText(o)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="px-1 text-[11px]" style={{ opacity: 0.5 }}>
        {t('objectives-auto', { defaultValue: 'Rewards are granted automatically the moment each objective is met.' })}
      </p>
    </div>
  );
}
