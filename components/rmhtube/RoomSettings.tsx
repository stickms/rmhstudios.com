/**
 * RoomSettings — Settings modal for the host.
 */
'use client';

import { useState, useCallback } from 'react';
import { X, Settings } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

export default function RoomSettings() {
  const room = useRmhTubeStore((s) => s.room);
  const [isOpen, setIsOpen] = useState(false);

  if (!room || room.myUserId !== room.hostUserId) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
        title="Room Settings"
      >
        <Settings className="h-5 w-5" />
      </button>

      {isOpen && (
        <SettingsModal
          settings={room.settings}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function SettingsModal({
  settings,
  onClose,
}: {
  settings: import('@/lib/rmhtube/types').RoomSettings;
  onClose: () => void;
}) {
  const [isPublic, setIsPublic] = useState(settings.isPublic);
  const [allowMemberQueue, setAllowMemberQueue] = useState(settings.allowMemberQueue);
  const [allowMemberSkip, setAllowMemberSkip] = useState(settings.allowMemberSkip);
  const [autoPlay, setAutoPlay] = useState(settings.autoPlay);

  const handleSave = useCallback(() => {
    emit(C2S.ROOM_UPDATE_SETTINGS, {
      settings: { isPublic, allowMemberQueue, allowMemberSkip, autoPlay },
    });
    onClose();
  }, [isPublic, allowMemberQueue, allowMemberSkip, autoPlay, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Room Settings</h3>
          <button onClick={onClose} className="rounded p-1 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <ToggleOption label="Public Room" description="Visible in room browser" value={isPublic} onChange={setIsPublic} />
          <ToggleOption label="Members Can Add Videos" description="Allow non-hosts to add to queue" value={allowMemberQueue} onChange={setAllowMemberQueue} />
          <ToggleOption label="Members Can Vote Skip" description="Allow non-hosts to vote-skip videos" value={allowMemberSkip} onChange={setAllowMemberSkip} />
          <ToggleOption label="Auto-Play" description="Automatically play next video in queue" value={autoPlay} onChange={setAutoPlay} />
        </div>

        <button
          onClick={handleSave}
          className="w-full mt-6 py-2.5 rounded-lg font-semibold text-white transition-colors bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ToggleOption({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-(--rmhtube-text)">{label}</p>
        <p className="text-xs text-(--rmhtube-text-dim)">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          value ? 'bg-(--rmhtube-accent)' : 'bg-(--rmhtube-border)'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}
