'use client';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { EVENT_MAP } from '@/lib/temple-of-joy/data/events';

export default function EventModal() {
  const pendingEvent = useTempleStore((s) => s.pendingEvent);
  const showEventModal = useTempleStore((s) => s.showEventModal);
  const resolveEvent = useTempleStore((s) => s.resolveEvent);
  const setShowEventModal = useTempleStore((s) => s.setShowEventModal);
  const theme = useTempleStore((s) => s.theme);

  if (!pendingEvent || !showEventModal) return null;

  const event = EVENT_MAP[pendingEvent];
  if (!event) return null;

  const dark = theme === 'dark';

  const handleResolve = (index: number) => {
    resolveEvent(pendingEvent, index);
    setShowEventModal(false);
  };

  const isBlessing = event.type === 'blessing';
  const choices = event.choices ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl"
        style={{
          background: dark ? '#2c1d12' : '#ede7d9',
          borderColor: dark ? '#6b4c2a' : '#c4a97a',
          color: dark ? '#e8d5b0' : '#3d2c1e',
        }}
      >
        {/* Title */}
        <h2
          className="text-2xl font-serif font-bold mb-3 text-center"
          style={{ color: dark ? '#d4a847' : '#8b6914' }}
        >
          {event.title}
        </h2>

        {/* Decorative divider */}
        <div
          className="h-px mb-4"
          style={{ background: dark ? '#6b4c2a' : '#c4a97a' }}
        />

        {/* Body */}
        <p className="text-sm italic text-center mb-6 leading-relaxed opacity-90">
          {event.body}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {isBlessing ? (
            <button
              onClick={() => handleResolve(0)}
              className="w-full rounded-xl py-2.5 font-semibold text-sm transition-opacity hover:opacity-80 active:opacity-60"
              style={{
                background: dark ? '#d4a847' : '#8b6914',
                color: dark ? '#1a120b' : '#f5f0e8',
              }}
            >
              Accept the gift ✓
            </button>
          ) : (
            choices.map((choice, i) => (
              <button
                key={i}
                onClick={() => handleResolve(i)}
                className="w-full rounded-xl py-2.5 font-medium text-sm text-left px-4 border transition-colors hover:opacity-80 active:opacity-60"
                style={{
                  borderColor: dark ? '#6b4c2a' : '#c4a97a',
                  background: dark ? '#1a120b' : '#f5f0e8',
                  color: dark ? '#e8d5b0' : '#3d2c1e',
                }}
              >
                {choice.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
