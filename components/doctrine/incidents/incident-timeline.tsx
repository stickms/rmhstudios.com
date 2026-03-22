interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

interface IncidentTimelineProps {
  events: TimelineEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  detected: '#EF4444',
  acknowledged: '#F59E0B',
  investigating: '#3B82F6',
  update: '#6B7280',
  mitigated: '#F59E0B',
  resolved: '#22C55E',
};

export function IncidentTimeline({ events }: IncidentTimelineProps) {
  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const color = EVENT_COLORS[event.type] ?? '#6B7280';
        return (
          <div
            key={event.id}
            className="relative pl-6 pb-4"
            style={{ borderLeft: i < events.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
          >
            <div
              className="absolute left-0 top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
              style={{ background: color }}
            />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase font-bold" style={{ color }}>
                  {event.type}
                </span>
                <span className="text-[10px] text-white/20">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-white/60">{event.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
