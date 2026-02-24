'use client';

import type { CollabUser } from '@/lib/rmh-utils/useCollaboration';

interface Props {
  collaborators: CollabUser[];
  connected: boolean;
}

export default function CollaboratorAvatars({ collaborators, connected }: Props) {
  if (collaborators.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-400'}`} />
        <span className="text-xs text-white/40">{connected ? 'Connected' : 'Connecting...'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {collaborators.slice(0, 5).map((user) => (
          <div
            key={user.id}
            title={user.name}
            className="w-7 h-7 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: user.color }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {collaborators.length > 5 && (
          <div className="w-7 h-7 rounded-full border-2 border-zinc-900 bg-white/10 flex items-center justify-center text-[10px] text-white/60">
            +{collaborators.length - 5}
          </div>
        )}
      </div>
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-400'}`} />
    </div>
  );
}
