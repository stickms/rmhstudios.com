/**
 * SettingsPanel — one gear, everything behind it.
 *
 * Settings were split in a way that made them feel arbitrary. The only panel
 * that existed was host-only and covered the *room*, so a viewer who opened
 * settings found nothing at all — while their own preferences (appearance,
 * timestamps, density) had no UI anywhere, and the appearance one was persisted
 * and applied on every load with no way to change it. Meanwhile eight more
 * preferences were saved to every browser and read by no code: toggling them
 * would have done nothing, which is why they are gone rather than surfaced.
 *
 * So: two sections in one sheet. **Yours** is local to this browser and open to
 * everyone; **Room** is shared, and shown only to the host who can change it.
 */
'use client';

import { useState, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Settings } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore, type RmhTubeUserSettings } from '@/lib/rmhtube/store';
import { ABSOLUTE_MAX_MEMBERS, AVAILABLE_REACTIONS } from '@/lib/rmhtube/constants';
import type { RoomSettings } from '@/lib/rmhtube/types';

export default function SettingsPanel() {
  const { t } = useTranslation('c-rmhtube');
  const [isOpen, setIsOpen] = useState(false);
  const hasRoom = useRmhTubeStore((s) => !!s.room);

  if (!hasRoom) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md p-2 transition-colors text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
        title={t('settings', { defaultValue: 'Settings' })}
        aria-label={t('settings', { defaultValue: 'Settings' })}
      >
        <Settings className="h-5 w-5" aria-hidden />
      </button>

      {isOpen && <SettingsDialog onClose={() => setIsOpen(false)} />}
    </>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-rmhtube');
  const titleId = useId();
  const settings = useRmhTubeStore((s) => s.settings);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const roomSettings = useRmhTubeStore((s) => s.room?.settings);
  const isHost = useRmhTubeStore((s) => !!s.room && s.room.myUserId === s.room.hostUserId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* A real button, so dismissing works from the keyboard too. */}
      <button
        type="button"
        aria-label={t('close', { defaultValue: 'Close' })}
        className="absolute inset-0 app-scrim app-overlay"
        onClick={onClose}
      />
      <div className="app-modal relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border border-(--app-border) bg-(--app-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="text-lg font-semibold text-(--app-text)">
            {t('settings', { defaultValue: 'Settings' })}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--app-text-muted) hover:text-(--app-text) transition-colors"
            aria-label={t('close', { defaultValue: 'Close' })}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <YourSettings settings={settings} onChange={updateSettings} />

        {isHost && roomSettings && <RoomSection settings={roomSettings} />}

        {!isHost && (
          <p className="mt-6 text-xs text-(--app-text-dim)">
            {t('room-settings-host-only', {
              defaultValue: 'Room settings — the queue, reactions and who can do what — are set by the host.',
            })}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Yours (local to this browser) ────────────────────────────────

function YourSettings({
  settings,
  onChange,
}: {
  settings: RmhTubeUserSettings;
  onChange: (partial: Partial<RmhTubeUserSettings>) => void;
}) {
  const { t } = useTranslation('c-rmhtube');

  return (
    <section>
      <SectionHeader
        title={t('your-settings', { defaultValue: 'Yours' })}
        note={t('your-settings-note', { defaultValue: 'Saved on this device only' })}
      />
      <div className="space-y-4 mb-6">
        <SelectOption
          label={t('appearance', { defaultValue: 'Appearance' })}
          description={t('appearance-desc', { defaultValue: 'How RmhTube looks on this device' })}
          value={settings.theme}
          onChange={(value) => onChange({ theme: value as RmhTubeUserSettings['theme'] })}
          options={[
            { value: 'dark', label: t('theme-dark', { defaultValue: 'Dark' }) },
            { value: 'light', label: t('theme-light', { defaultValue: 'Light' }) },
            { value: 'high-contrast', label: t('theme-high-contrast', { defaultValue: 'High contrast' }) },
          ]}
        />
        <SelectOption
          label={t('density', { defaultValue: 'Density' })}
          description={t('density-desc', { defaultValue: 'How much breathing room the layout gets' })}
          value={settings.layoutDensity}
          onChange={(value) => onChange({ layoutDensity: value as RmhTubeUserSettings['layoutDensity'] })}
          options={[
            { value: 'compact', label: t('density-compact', { defaultValue: 'Compact' }) },
            { value: 'comfortable', label: t('density-comfortable', { defaultValue: 'Comfortable' }) },
            { value: 'spacious', label: t('density-spacious', { defaultValue: 'Spacious' }) },
          ]}
        />
        <ToggleOption
          label={t('theater-mode', { defaultValue: 'Theater mode' })}
          description={t('theater-mode-desc', { defaultValue: 'Bigger video, chat in a drawer (T)' })}
          value={settings.theaterMode}
          onChange={(value) => onChange({ theaterMode: value })}
        />
        <ToggleOption
          label={t('enable-captions', { defaultValue: 'Enable captions' })}
          description={t('captions-desc', { defaultValue: 'Show subtitles when the video has them (C)' })}
          value={settings.captionsEnabled}
          onChange={(value) => onChange({ captionsEnabled: value })}
        />
        <ToggleOption
          label={t('show-timestamps', { defaultValue: 'Message times' })}
          description={t('show-timestamps-desc', { defaultValue: 'Show when each message was sent' })}
          value={settings.showTimestamps}
          onChange={(value) => onChange({ showTimestamps: value })}
        />
        <ToggleOption
          label={t('show-system-messages', { defaultValue: 'Room notices' })}
          description={t('show-system-messages-desc', { defaultValue: 'Joins, leaves and now-playing lines in chat' })}
          value={settings.showSystemMessages}
          onChange={(value) => onChange({ showSystemMessages: value })}
        />
      </div>
    </section>
  );
}

// ─── Room (shared; host only) ─────────────────────────────────────

function RoomSection({ settings }: { settings: RoomSettings }) {
  const { t } = useTranslation('c-rmhtube');

  const [isPublic, setIsPublic] = useState(settings.isPublic);
  const [maxMembers, setMaxMembers] = useState(settings.maxMembers);
  const [password, setPassword] = useState(settings.password ?? '');
  const [allowMemberQueue, setAllowMemberQueue] = useState(settings.allowMemberQueue);
  const [allowMemberSkip, setAllowMemberSkip] = useState(settings.allowMemberSkip);
  const [autoPlay, setAutoPlay] = useState(settings.autoPlay);
  const [waitForSlowPeers, setWaitForSlowPeers] = useState(settings.waitForSlowPeers);
  const [queueVoting, setQueueVoting] = useState(settings.queueVoting);
  const [autoSortByVotes, setAutoSortByVotes] = useState(settings.autoSortByVotes);
  const [loopQueue, setLoopQueue] = useState(settings.loopQueue);
  const [enableCustomReactions, setEnableCustomReactions] = useState(settings.customReactions !== null);
  const [customReactionsInput, setCustomReactionsInput] = useState(
    (settings.customReactions ?? AVAILABLE_REACTIONS).join(' '),
  );
  const [saved, setSaved] = useState(false);

  const customReactions = splitReactions(customReactionsInput);
  const reactionsInvalid = enableCustomReactions && (customReactions.length < 4 || customReactions.length > 12);

  const handleSave = useCallback(() => {
    if (reactionsInvalid) return;
    emit(C2S.ROOM_UPDATE_SETTINGS, {
      settings: {
        isPublic,
        maxMembers,
        password: password.trim() ? password.trim() : null,
        allowMemberQueue,
        allowMemberSkip,
        autoPlay,
        waitForSlowPeers,
        queueVoting,
        autoSortByVotes,
        loopQueue,
        customReactions: enableCustomReactions ? customReactions : null,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2_000);
  }, [
    reactionsInvalid, isPublic, maxMembers, password, allowMemberQueue, allowMemberSkip,
    autoPlay, waitForSlowPeers, queueVoting, autoSortByVotes, loopQueue,
    enableCustomReactions, customReactions,
  ]);

  return (
    <section>
      <SectionHeader
        title={t('room-settings', { defaultValue: 'Room Settings' })}
        note={t('room-settings-note', { defaultValue: 'Applies to everyone here' })}
      />

      <div className="space-y-4 mb-6">
        <ToggleOption
          label={t('public-room', { defaultValue: 'Public Room' })}
          description={t('public-room-desc', { defaultValue: 'Visible in room browser' })}
          value={isPublic}
          onChange={setIsPublic}
        />
        <NumberOption
          label={t('max-members', { defaultValue: 'Member limit' })}
          description={t('max-members-desc', { defaultValue: 'How many people can watch at once' })}
          value={maxMembers}
          min={2}
          max={ABSOLUTE_MAX_MEMBERS}
          onChange={setMaxMembers}
        />
        <TextOption
          label={t('room-password', { defaultValue: 'Password' })}
          description={t('room-password-desc', { defaultValue: 'Leave empty for no password' })}
          value={password}
          onChange={setPassword}
          placeholder={t('room-password-placeholder', { defaultValue: 'No password' })}
        />
      </div>

      <SectionHeader title={t('participation', { defaultValue: 'Participation' })} />
      <div className="space-y-4 mb-6">
        <ToggleOption
          label={t('members-can-add-videos', { defaultValue: 'Members Can Add Videos' })}
          description={t('members-can-add-videos-desc', { defaultValue: 'Allow non-hosts to add to queue' })}
          value={allowMemberQueue}
          onChange={setAllowMemberQueue}
        />
        <ToggleOption
          label={t('members-can-vote-skip', { defaultValue: 'Members Can Vote Skip' })}
          description={t('members-can-vote-skip-desc', { defaultValue: 'Allow non-hosts to vote-skip videos' })}
          value={allowMemberSkip}
          onChange={setAllowMemberSkip}
        />
      </div>

      <SectionHeader title={t('playback', { defaultValue: 'Playback' })} />
      <div className="space-y-4 mb-6">
        <ToggleOption
          label={t('auto-play', { defaultValue: 'Auto-Play' })}
          description={t('auto-play-desc', { defaultValue: 'Automatically play next video in queue' })}
          value={autoPlay}
          onChange={setAutoPlay}
        />
        <ToggleOption
          label={t('wait-for-slow-peers', { defaultValue: 'Wait for buffering viewers' })}
          description={t('wait-for-slow-peers-desc', {
            defaultValue: 'Pause the room for a moment when someone is still loading, instead of leaving them behind',
          })}
          value={waitForSlowPeers}
          onChange={setWaitForSlowPeers}
        />
      </div>

      <SectionHeader title={t('queue', { defaultValue: 'Queue' })} />
      <div className="space-y-4 mb-6">
        <ToggleOption
          label={t('allow-queue-voting', { defaultValue: 'Allow Queue Voting' })}
          description={t('allow-queue-voting-desc', { defaultValue: 'Members can upvote queue items' })}
          value={queueVoting}
          onChange={setQueueVoting}
        />
        {queueVoting && (
          <ToggleOption
            label={t('auto-sort-by-votes', { defaultValue: 'Auto-Sort by Votes' })}
            description={t('auto-sort-by-votes-desc', { defaultValue: 'Queue items sorted by vote count' })}
            value={autoSortByVotes}
            onChange={setAutoSortByVotes}
          />
        )}
        <ToggleOption
          label={t('loop-queue', { defaultValue: 'Loop Queue' })}
          description={t('loop-queue-desc', { defaultValue: 'Restart from beginning when queue ends' })}
          value={loopQueue}
          onChange={setLoopQueue}
        />
      </div>

      <SectionHeader title={t('reactions', { defaultValue: 'Reactions' })} />
      <div className="space-y-4 mb-6">
        <ToggleOption
          label={t('custom-reactions', { defaultValue: 'Custom Reactions' })}
          description={t('custom-reactions-desc', { defaultValue: 'Set custom emoji reactions for this room' })}
          value={enableCustomReactions}
          onChange={setEnableCustomReactions}
        />
        {enableCustomReactions && (
          <div className="pl-1">
            <label className="block text-xs font-medium text-(--app-text-muted) mb-1" htmlFor="rmhtube-custom-reactions">
              {t('custom-reactions-input', { defaultValue: 'Between 4 and 12 emoji, separated by spaces' })}
            </label>
            <input
              id="rmhtube-custom-reactions"
              type="text"
              value={customReactionsInput}
              onChange={(e) => setCustomReactionsInput(e.target.value)}
              aria-invalid={reactionsInvalid}
              className="w-full rounded-lg border border-(--app-border) bg-(--app-bg) px-3 py-2 text-sm text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
            />
            <p className={`mt-1 text-xs ${reactionsInvalid ? 'text-(--app-danger)' : 'text-(--app-text-dim)'}`}>
              {t('custom-reactions-count', { defaultValue: '{{count}} selected', count: customReactions.length })}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={reactionsInvalid}
        className="w-full py-2.5 rounded-lg font-semibold text-(--app-accent-fg) transition-colors disabled:opacity-50 bg-(--app-accent) hover:bg-(--app-accent-hover)"
      >
        {saved
          ? t('room-settings-saved', { defaultValue: 'Saved' })
          : t('save-room-settings', { defaultValue: 'Save room settings' })}
      </button>
    </section>
  );
}

/** Emoji are multi-codepoint, so split on whitespace rather than characters. */
function splitReactions(input: string): string[] {
  return input.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean).slice(0, 12);
}

// ─── Controls ─────────────────────────────────────────────────────

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-(--app-text-muted)">{title}</h4>
      {note && <span className="text-[11px] text-(--app-text-dim)">{note}</span>}
    </div>
  );
}

function OptionRow({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <label className="text-sm font-medium text-(--app-text)" htmlFor={htmlFor}>{label}</label>
        <p className="text-xs text-(--app-text-dim)">{description}</p>
      </div>
      {control}
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
    <OptionRow
      label={label}
      description={description}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
            value ? 'bg-(--app-accent)' : 'bg-(--app-border)'
          }`}
        >
          {/* Ink tracks its surface: the knob sits on the accent when on and on
              the hairline when off, so it stays visible in every appearance. */}
          <span
            className={`inline-block h-4 w-4 rounded-full shadow transition-transform ${
              value ? 'translate-x-5 bg-(--app-accent-fg)' : 'translate-x-1 bg-(--app-text)'
            }`}
          />
        </button>
      }
    />
  );
}

function SelectOption({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <OptionRow
      label={label}
      description={description}
      htmlFor={id}
      control={
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="shrink-0 rounded-lg border border-(--app-border) bg-(--app-bg) px-2 py-1.5 text-sm text-(--app-text) outline-none focus:ring-1 focus:ring-(--app-accent)"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      }
    />
  );
}

function NumberOption({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <OptionRow
      label={label}
      description={description}
      htmlFor={id}
      control={
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="w-20 shrink-0 rounded-lg border border-(--app-border) bg-(--app-bg) px-2 py-1.5 text-sm text-(--app-text) outline-none focus:ring-1 focus:ring-(--app-accent)"
        />
      }
    />
  );
}

function TextOption({
  label,
  description,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <OptionRow
      label={label}
      description={description}
      htmlFor={id}
      control={
        <input
          id={id}
          type="text"
          value={value}
          maxLength={64}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 shrink-0 rounded-lg border border-(--app-border) bg-(--app-bg) px-2 py-1.5 text-sm text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
        />
      }
    />
  );
}
