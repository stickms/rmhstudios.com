// RMH Farming Simulator — crew panel: member list w/ online status, host
// controls (approve/deny join requests, kick), share code + rename.
'use client';

import { useState } from 'react';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';

export default function MembersPanel() {
    const open = useRfsStore((s) => s.membersOpen);
    const setOpen = useRfsStore((s) => s.setMembersOpen);
    const members = useRfsStore((s) => s.members);
    const farm = useRfsStore((s) => s.farm);
    const welcome = useRfsStore((s) => s.welcome);
    const pushToast = useRfsStore((s) => s.pushToast);
    const [rename, setRename] = useState('');

    if (!open) return null;
    const isHost = members ? members.ownerUserId === welcome?.userId : farm?.id === welcome?.userId;

    const copyCode = () => {
        if (farm?.code && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(farm.code).then(
                () => pushToast('Farm code copied!', 'success'),
                () => pushToast(farm.code, 'info'),
            );
        }
    };

    return (
        <div className="rfs-modal-backdrop" onClick={() => setOpen(false)}>
            <div className="rfs-modal rfs-modal-narrow" onClick={(e) => e.stopPropagation()}>
                <div className="rfs-modal-head">
                    <h2>👥 Farm Crew</h2>
                    <button className="rfs-x" onClick={() => setOpen(false)}>
                        ✕
                    </button>
                </div>

                <div className="rfs-modal-body">
                    <div className="rfs-share">
                        <div>
                            <div className="rfs-row-sub">Invite code</div>
                            <div className="rfs-share-code">{farm?.code}</div>
                        </div>
                        <button className="rfs-mini" onClick={copyCode}>
                            Copy
                        </button>
                    </div>

                    {isHost && (
                        <div className="rfs-rename">
                            <input
                                value={rename}
                                placeholder="Rename farm…"
                                maxLength={32}
                                onChange={(e) => setRename(e.target.value)}
                            />
                            <button
                                className="rfs-mini"
                                onClick={() => {
                                    if (rename.trim()) {
                                        actions.renameFarm(rename.trim());
                                        setRename('');
                                    }
                                }}
                            >
                                Save
                            </button>
                        </div>
                    )}

                    {isHost && members && members.joinRequests.length > 0 && (
                        <>
                            <div className="rfs-section-title">Join requests</div>
                            <div className="rfs-list">
                                {members.joinRequests.map((r) => (
                                    <div className="rfs-row" key={r.userId}>
                                        <span className="rfs-avatar-dot" />
                                        <div className="rfs-row-main">
                                            <div className="rfs-row-name">{r.name}</div>
                                            <div className="rfs-row-sub">wants to join</div>
                                        </div>
                                        <div className="rfs-row-actions">
                                            <button className="rfs-mini ok" onClick={() => actions.approveJoin(r.userId)}>
                                                Accept
                                            </button>
                                            <button className="rfs-mini bad" onClick={() => actions.denyJoin(r.userId)}>
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <div className="rfs-section-title">Members</div>
                    <div className="rfs-list">
                        {members?.members.map((m) => (
                            <div className="rfs-row" key={m.userId}>
                                <span className={`rfs-avatar-dot ${m.online ? 'online' : ''}`} />
                                <div className="rfs-row-main">
                                    <div className="rfs-row-name">
                                        {m.name}
                                        {m.isHost && <span className="rfs-host-tag">HOST</span>}
                                        {m.userId === welcome?.userId && <span className="rfs-you-tag">YOU</span>}
                                    </div>
                                    <div className="rfs-row-sub">{m.online ? 'online' : 'offline'}</div>
                                </div>
                                {isHost && !m.isHost && (
                                    <div className="rfs-row-actions">
                                        <button className="rfs-mini bad" onClick={() => actions.kick(m.userId)}>
                                            Kick
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
