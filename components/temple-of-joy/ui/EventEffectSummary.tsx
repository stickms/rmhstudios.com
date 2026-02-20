'use client';
import { useTempleStore } from '@/lib/temple-of-joy/store';

export default function EventEffectSummary() {
  const lastEventEffect = useTempleStore((s) => s.lastEventEffect);

  if (!lastEventEffect) return null;

  const isExpired = Date.now() >= lastEventEffect.expiresAt;
  if (isExpired) return null;

  const remainingMs = lastEventEffect.expiresAt - Date.now();
  const opacity = Math.max(0, Math.min(1, remainingMs / 500)); // Fade out in last 500ms

  return (
    <div
      className="fixed bottom-4 right-4 max-w-xs rounded-lg border p-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 transition-opacity"
      style={{
        background: 'rgba(212,168,71,0.15)',
        borderColor: 'var(--temple-accent)',
        color: 'var(--temple-text)',
        opacity: opacity,
        zIndex: 40,
      }}
    >
      <h3
        className="text-xs font-bold mb-1 uppercase tracking-wide"
        style={{ color: 'var(--temple-accent)' }}
      >
        {lastEventEffect.title}
      </h3>
      <div className="text-[11px] space-y-0.5" style={{ opacity: 0.9 }}>
        {lastEventEffect.summary.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
