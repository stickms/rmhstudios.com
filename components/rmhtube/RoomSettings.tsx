/**
 * RoomSettings — Settings modal for the host and moderators.
 */
'use client';

import { useState, useCallback } from 'react';
import { X, Settings } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import type { RoomSettings as RoomSettingsType } from '@/lib/rmhtube/types';

export default function RoomSettings() {
  const room = useRmhTubeStore((s) => s.room);
  const [isOpen, setIsOpen] = useState(false);

  if (!room) return null;

  const myRole = room.members.find((m) => m.userId === room.myUserId)?.role;
  if (myRole !== 'host' && myRole !== 'moderator') return null;

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
  settings: RoomSettingsType;
  onClose: () => void;
}) {
  // General
  const [isPublic, setIsPublic] = useState(settings.isPublic);
  const [allowMemberQueue, setAllowMemberQueue] = useState(settings.allowMemberQueue);
  const [allowMemberSkip, setAllowMemberSkip] = useState(settings.allowMemberSkip);
  const [autoPlay, setAutoPlay] = useState(settings.autoPlay);

  // Queue (Phase 3)
  const [queueVoting, setQueueVoting] = useState(settings.queueVoting);
  const [autoSortByVotes, setAutoSortByVotes] = useState(settings.autoSortByVotes);
  const [loopQueue, setLoopQueue] = useState(settings.loopQueue);

  // Reactions (Phase 5)
  const [enableCustomReactions, setEnableCustomReactions] = useState(
    settings.customReactions !== null,
  );
  const [customReactionsInput, setCustomReactionsInput] = useState(
    settings.customReactions?.join(', ') ?? '',
  );

  const handleSave = useCallback(() => {
    const customReactionsArray = enableCustomReactions
      ? customReactionsInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    emit(C2S.ROOM_UPDATE_SETTINGS, {
      settings: {
        isPublic,
        allowMemberQueue,
        allowMemberSkip,
        autoPlay,
        queueVoting,
        autoSortByVotes,
        loopQueue,
        customReactions: enableCustomReactions ? customReactionsArray : null,
      },
    });
    onClose();
  }, [
    isPublic,
    allowMemberQueue,
    allowMemberSkip,
    autoPlay,
    queueVoting,
    autoSortByVotes,
    loopQueue,
    enableCustomReactions,
    customReactionsInput,
    onClose,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Room Settings</h3>
          <button onClick={onClose} className="rounded p-1 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* General */}
        <SectionHeader title="General" />
        <div className="space-y-4 mb-6">
          <ToggleOption label="Public Room" description="Visible in room browser" value={isPublic} onChange={setIsPublic} />
          <ToggleOption label="Members Can Add Videos" description="Allow non-hosts to add to queue" value={allowMemberQueue} onChange={setAllowMemberQueue} />
          <ToggleOption label="Members Can Vote Skip" description="Allow non-hosts to vote-skip videos" value={allowMemberSkip} onChange={setAllowMemberSkip} />
          <ToggleOption label="Auto-Play" description="Automatically play next video in queue" value={autoPlay} onChange={setAutoPlay} />
        </div>

        {/* Queue */}
        <SectionHeader title="Queue" />
        <div className="space-y-4 mb-6">
          <ToggleOption label="Allow Queue Voting" description="Members can upvote queue items" value={queueVoting} onChange={setQueueVoting} />
          {queueVoting && (
            <ToggleOption label="Auto-Sort by Votes" description="Queue items sorted by vote count" value={autoSortByVotes} onChange={setAutoSortByVotes} />
          )}
          <ToggleOption label="Loop Queue" description="Restart from beginning when queue ends" value={loopQueue} onChange={setLoopQueue} />
        </div>

        {/* Reactions */}
        <SectionHeader title="Reactions" />
        <div className="space-y-4 mb-6">
          <ToggleOption label="Custom Reactions" description="Set custom emoji reactions for this room" value={enableCustomReactions} onChange={setEnableCustomReactions} />
          {enableCustomReactions && (
            <div className="pl-1">
              <label className="block text-xs font-medium text-(--rmhtube-text-muted) mb-1">
                Comma-separated emojis
              </label>
              <input
                type="text"
                value={customReactionsInput}
                onChange={(e) => setCustomReactionsInput(e.target.value)}
                placeholder="e.g. fire, heart, laughing"
                className="w-full rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) px-3 py-2 text-sm text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) focus:outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full mt-2 py-2.5 rounded-lg font-semibold text-white transition-colors bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-(--rmhtube-text-muted) mb-3">
      {title}
    </h4>
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
