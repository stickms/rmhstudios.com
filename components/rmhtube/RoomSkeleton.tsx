/**
 * RoomSkeleton — Loading skeleton for the room page.
 *
 * Displays a shimmer placeholder while room data is loading.
 * Matches the 2-column desktop layout structure.
 */
'use client';

export default function RoomSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Video skeleton */}
      <div className="shrink-0 p-4 pb-2">
        <div className="rmhtube-skeleton w-full aspect-video rounded-xl" />
      </div>

      {/* Controls skeleton */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-(--rmhtube-border)">
        <div className="rmhtube-skeleton w-8 h-8 rounded-full" />
        <div className="flex-1">
          <div className="rmhtube-skeleton rmhtube-skeleton-text w-48" />
          <div className="rmhtube-skeleton rmhtube-skeleton-text w-24 mt-1" />
        </div>
        <div className="rmhtube-skeleton w-20 h-1 rounded" />
      </div>

      {/* Queue skeleton */}
      <div className="flex-1 min-h-0 p-2 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
            <div className="rmhtube-skeleton rmhtube-skeleton-thumbnail" />
            <div className="flex-1">
              <div className="rmhtube-skeleton rmhtube-skeleton-text w-3/4" />
              <div className="rmhtube-skeleton rmhtube-skeleton-text w-1/2 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-(--rmhtube-border)">
        <div className="rmhtube-skeleton rmhtube-skeleton-text w-16" />
      </div>
      <div className="flex-1 p-3 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="rmhtube-skeleton rmhtube-skeleton-text" style={{ width: `${40 + Math.random() * 40}%` }} />
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-(--rmhtube-border)">
        <div className="rmhtube-skeleton h-10 rounded-lg" />
      </div>
    </div>
  );
}

export function MembersSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-(--rmhtube-border)">
        <div className="rmhtube-skeleton rmhtube-skeleton-text w-24" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 p-2">
            <div className="rmhtube-skeleton rmhtube-skeleton-avatar" />
            <div className="flex-1">
              <div className="rmhtube-skeleton rmhtube-skeleton-text w-20" />
            </div>
            <div className="rmhtube-skeleton w-4 h-4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
