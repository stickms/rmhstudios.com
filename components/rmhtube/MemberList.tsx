/**
 * MemberList — User presence sidebar with role badges, presence status,
 * leader transfer, ban, kick, and host transfer controls.
 *
 * Features:
 *  - Role badges (Host / Leader)
 *  - Leader transfer (host or current leader can set new leader)
 *  - Ban/kick controls (host only)
 *  - Presence status (watching / afk / brb) with self-selector
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Crown,
  Wifi,
  WifiOff,
  UserX,
  ArrowRightLeft,
  Star,
  Ban,
  Eye,
  Coffee,
  Clock,
} from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import type { ClientMemberInfo, UserPresenceStatus } from '@/lib/rmhtube/types';

// ─── Presence helpers ──────────────────────────────────────────

const STATUS_OPTIONS: { value: UserPresenceStatus; label: string }[] = [
  { value: 'watching', label: 'Watching' },
  { value: 'afk', label: 'AFK' },
  { value: 'brb', label: 'BRB' },
];

function PresenceBadge({ status }: { status: UserPresenceStatus }) {
  const { t } = useTranslation("c-rmhtube");
  if (status === 'afk') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-yellow-500/20 text-yellow-400">
        <Coffee className="h-2.5 w-2.5" />
        {t("status-afk", { defaultValue: "AFK" })}
      </span>
    );
  }
  if (status === 'brb') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-orange-500/20 text-orange-400">
        <Clock className="h-2.5 w-2.5" />
        {t("status-brb", { defaultValue: "BRB" })}
      </span>
    );
  }
  // 'watching' — no extra badge; the green Wifi dot already conveys this
  return null;
}

// ─── Sorting ───────────────────────────────────────────────────

function sortMembers(members: ClientMemberInfo[]): ClientMemberInfo[] {
  return [...members].sort((a, b) => {
    // Host first, then leader, then everyone else
    const pa = a.isHost ? 0 : a.isLeader ? 1 : 2;
    const pb = b.isHost ? 0 : b.isLeader ? 1 : 2;
    if (pa !== pb) return pa - pb;
    // Secondary: connected before disconnected
    if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
    // Tertiary: alphabetical
    return a.userName.localeCompare(b.userName);
  });
}

// ─── Status Selector (for the current user) ───────────────────

function StatusSelector({ currentStatus }: { currentStatus: UserPresenceStatus }) {
  const { t } = useTranslation("c-rmhtube");
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const handleOpen = useCallback(() => {
    setOpen((o) => {
      if (!o && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
      return !o;
    });
  }, []);

  const handleChange = useCallback((status: UserPresenceStatus) => {
    emit(C2S.ROOM_SET_STATUS, { status });
    setOpen(false);
  }, []);

  // Icon for current status
  const StatusIcon =
    currentStatus === 'afk' ? Coffee : currentStatus === 'brb' ? Clock : Eye;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors
          text-(--rmhtube-text-dim) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
        title={t("change-your-status", { defaultValue: "Change your status" })}
      >
        <StatusIcon className="h-3 w-3" />
        {currentStatus === 'watching' ? t("status-watching", { defaultValue: "Watching" }) : currentStatus.toUpperCase()}
      </button>

      {open && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 min-w-27.5 rounded-md border border-(--rmhtube-border) bg-(--rmhtube-surface) shadow-lg py-1"
            style={{ top: pos.top, right: pos.right }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-(--rmhtube-surface-hover) ${
                  opt.value === currentStatus
                    ? 'text-(--rmhtube-accent) font-semibold'
                    : 'text-(--rmhtube-text)'
                }`}
              >
                {opt.value === 'watching' && <Eye className="h-3 w-3 text-green-400" />}
                {opt.value === 'afk' && <Coffee className="h-3 w-3 text-yellow-400" />}
                {opt.value === 'brb' && <Clock className="h-3 w-3 text-orange-400" />}
                {opt.value === 'watching' ? t("status-watching", { defaultValue: "Watching" }) : opt.value === 'afk' ? t("status-afk", { defaultValue: "AFK" }) : t("status-brb", { defaultValue: "BRB" })}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── Role Badge ────────────────────────────────────────────────

function RoleBadge({ isHost, isLeader }: { isHost: boolean; isLeader: boolean }) {
  const { t } = useTranslation("c-rmhtube");
  return (
    <>
      {isHost && (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-(--rmhtube-warning)/20 text-(--rmhtube-warning)">
          <Crown className="h-2.5 w-2.5" />
          {t("role-host", { defaultValue: "Host" })}
        </span>
      )}
      {isLeader && (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-(--rmhtube-info)/20 text-(--rmhtube-info)">
          <Star className="h-2.5 w-2.5" />
          {t("role-leader", { defaultValue: "Leader" })}
        </span>
      )}
    </>
  );
}

// ─── Ban Confirmation Dialog ───────────────────────────────────

function BanConfirmDialog({
  memberName,
  onConfirm,
  onCancel,
}: {
  memberName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("c-rmhtube");
  const [reason, setReason] = useState('');

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-80 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-surface) p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h4 className="text-sm font-semibold text-(--rmhtube-text) mb-2">
            {t("ban-dialog-title", { defaultValue: "Ban {{name}}?", name: memberName })}
          </h4>
          <p className="text-xs text-(--rmhtube-text-muted) mb-3">
            {t("ban-dialog-description", { defaultValue: "This will remove them from the room and prevent them from rejoining." })}
          </p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("ban-reason-placeholder", { defaultValue: "Reason (optional)" })}
            className="w-full rounded border border-(--rmhtube-border) bg-(--rmhtube-bg) px-2 py-1.5 text-xs text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) focus:outline-none focus:border-(--rmhtube-accent) mb-3"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs font-medium text-(--rmhtube-text-muted) hover:bg-(--rmhtube-surface-hover) transition-colors"
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              onClick={() => onConfirm(reason)}
              className="rounded px-3 py-1.5 text-xs font-medium bg-(--rmhtube-danger) text-white hover:opacity-90 transition-opacity"
            >
              {t("ban-confirm", { defaultValue: "Ban" })}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function MemberList() {
  const { t } = useTranslation("c-rmhtube");
  const room = useRmhTubeStore((s) => s.room);
  const [banTarget, setBanTarget] = useState<ClientMemberInfo | null>(null);

  // ── Actions ──

  const handleKick = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_KICK, { targetUserId });
  }, []);

  const handleTransferHost = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_TRANSFER_HOST, { targetUserId });
  }, []);

  const handleSetLeader = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_SET_LEADER, { targetUserId });
  }, []);

  const handleBanConfirm = useCallback(
    (reason: string) => {
      if (!banTarget) return;
      emit(C2S.ROOM_BAN, { targetUserId: banTarget.userId, ...(reason ? { reason } : {}) });
      setBanTarget(null);
    },
    [banTarget],
  );

  // ── Derived state ──

  const sortedMembers = useMemo(
    () => (room ? sortMembers(room.members) : []),
    [room],
  );

  if (!room) return null;

  const myMember = room.members.find((m) => m.userId === room.myUserId);
  const isHost = room.myUserId === room.hostUserId;
  const isLeader = room.myUserId === room.leaderUserId;
  const canSetLeader = isHost || isLeader;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-(--rmhtube-border) flex items-center justify-between">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">
          {t("members-header", { defaultValue: "Members ({{count}})", count: room.members.length })}
        </h3>
        {/* Status selector for current user */}
        {myMember && <StatusSelector currentStatus={myMember.status} />}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedMembers.map((member) => {
          const isMe = member.userId === room.myUserId;
          const memberIsHost = member.isHost;
          const memberIsLeader = member.isLeader;

          // Determine which controls are available for this member
          const showMakeLeader = canSetLeader && !isMe && !memberIsLeader;
          const showKick = isHost && !isMe;
          const showBan = isHost && !isMe;
          const showTransfer = isHost && !isMe;

          return (
            <div
              key={member.userId}
              className={`flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-(--rmhtube-surface-hover) ${
                !member.isConnected ? 'opacity-50' : ''
              }`}
            >
              {/* Avatar */}
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt=""
                  className="shrink-0 w-8 h-8 rounded-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
                />
              ) : (
                <div className="shrink-0 w-8 h-8 rounded-full bg-(--rmhtube-surface-active) flex items-center justify-center text-xs font-bold text-(--rmhtube-text-muted)">
                  {member.userName.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Name + role badge + presence */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-sm font-medium truncate ${
                      member.isHost
                        ? 'text-(--rmhtube-accent)'
                        : 'text-(--rmhtube-text)'
                    }`}
                  >
                    {member.userName}
                  </span>
                  <RoleBadge isHost={memberIsHost} isLeader={memberIsLeader} />
                  {isMe && (
                    <span className="text-xs text-(--rmhtube-text-dim)">{t("you-label", { defaultValue: "(you)" })}</span>
                  )}
                </div>
                {/* Presence badge (afk / brb) shown below the name row */}
                {member.status !== 'watching' && (
                  <div className="mt-0.5">
                    <PresenceBadge status={member.status} />
                  </div>
                )}
              </div>

              {/* Connection status */}
              <div className="shrink-0">
                {member.isConnected ? (
                  <Wifi className="h-3.5 w-3.5 text-(--rmhtube-success)" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-(--rmhtube-danger)" />
                )}
              </div>

              {/* Controls */}
              {(showTransfer || showMakeLeader || showKick || showBan) && (
                <div className="shrink-0 flex gap-1">
                  {/* Transfer host (host only) */}
                  {showTransfer && (
                    <button
                      onClick={() => handleTransferHost(member.userId)}
                      className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-warning) hover:bg-(--rmhtube-warning-dim)"
                      title={t("transfer-host", { defaultValue: "Transfer host" })}
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                    </button>
                  )}

                  {/* Make leader (host or current leader can set) */}
                  {showMakeLeader && (
                    <button
                      onClick={() => handleSetLeader(member.userId)}
                      className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-info) hover:bg-(--rmhtube-info-dim)"
                      title={t("make-leader", { defaultValue: "Make leader" })}
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}

                  {/* Kick (host only) */}
                  {showKick && (
                    <button
                      onClick={() => handleKick(member.userId)}
                      className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-danger) hover:bg-(--rmhtube-danger-dim)"
                      title={t("kick", { defaultValue: "Kick" })}
                    >
                      <UserX className="h-3 w-3" />
                    </button>
                  )}

                  {/* Ban (host only) */}
                  {showBan && (
                    <button
                      onClick={() => setBanTarget(member)}
                      className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-danger) hover:bg-(--rmhtube-danger-dim)"
                      title={t("ban", { defaultValue: "Ban" })}
                    >
                      <Ban className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ban confirmation dialog */}
      {banTarget && (
        <BanConfirmDialog
          memberName={banTarget.userName}
          onConfirm={handleBanConfirm}
          onCancel={() => setBanTarget(null)}
        />
      )}
    </div>
  );
}
