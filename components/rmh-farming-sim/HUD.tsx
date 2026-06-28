// RMH Farming Simulator — heads-up display: top status bar + tool/seed hotbar.
'use client';

import { useEffect, useMemo } from 'react';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';
import type { HotbarSelection, ToolId } from '@/lib/rmh-farming-sim/types';

const TOOL_ICONS: Record<ToolId, string> = { hoe: '⛏️', can: '💧', scythe: '🌾' };
const WEATHER_ICON: Record<string, string> = { sunny: '☀️', rain: '🌧️' };

export default function HUD() {
    const stats = useRfsStore((s) => s.stats);
    const farm = useRfsStore((s) => s.farm);
    const welcome = useRfsStore((s) => s.welcome);
    const members = useRfsStore((s) => s.members);
    const selection = useRfsStore((s) => s.selection);
    const setSelection = useRfsStore((s) => s.setSelection);
    const setShopOpen = useRfsStore((s) => s.setShopOpen);
    const setMembersOpen = useRfsStore((s) => s.setMembersOpen);
    const cropById = useRfsStore((s) => s.cropById);

    const isOwnFarm = farm?.id === welcome?.userId;
    const isHost = members ? members.ownerUserId === welcome?.userId : isOwnFarm;
    const maxEnergy = welcome?.maxEnergy ?? 100;

    // hotbar slots: 3 tools then owned seeds
    const slots = useMemo<HotbarSelection[]>(() => {
        const tools: HotbarSelection[] = [
            { kind: 'tool', tool: 'hoe' },
            { kind: 'tool', tool: 'can' },
            { kind: 'tool', tool: 'scythe' },
        ];
        const seeds: HotbarSelection[] = Object.entries(farm?.seeds ?? {})
            .filter(([, qty]) => qty > 0)
            .map(([cropId]) => ({ kind: 'seed', cropId }));
        return [...tools, ...seeds];
    }, [farm?.seeds]);

    // number-key selection
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (document.activeElement?.tagName ?? '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.code === 'KeyE') {
                actions.sleep();
                return;
            }
            const n = parseInt(e.key, 10);
            if (!isNaN(n) && n >= 1 && n <= slots.length) setSelection(slots[n - 1]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [slots, setSelection]);

    const selKey = (s: HotbarSelection) => (s.kind === 'tool' ? `t:${s.tool}` : `s:${s.cropId}`);
    const activeKey = selKey(selection);

    return (
        <div className="rfs-hud">
            {/* top status bar */}
            <div className="rfs-topbar">
                <div className="rfs-farminfo">
                    <span className="rfs-farmname">{farm?.name ?? 'Farm'}</span>
                    <span className="rfs-code">#{farm?.code}</span>
                </div>
                <div className="rfs-stat rfs-money">💰 {stats?.money ?? 0}g</div>
                <div className="rfs-stat">
                    {WEATHER_ICON[stats?.weather ?? 'sunny']} Day {stats?.day ?? 1}
                </div>
                <div className="rfs-stat rfs-season">
                    {seasonEmoji(stats?.season)} {stats?.season ?? 'spring'} {stats?.dayOfSeason ?? 1}/
                    {stats?.daysPerSeason ?? 7}
                </div>
                <div className="rfs-energy">
                    <span className="rfs-energy-label">⚡</span>
                    <div className="rfs-energy-bar">
                        <div
                            className="rfs-energy-fill"
                            style={{ width: `${Math.round(((stats?.energy ?? maxEnergy) / maxEnergy) * 100)}%` }}
                        />
                    </div>
                </div>

                <div className="rfs-topbtns">
                    <button className="rfs-btn" onClick={() => setShopOpen(true)}>
                        🏪 Shop
                    </button>
                    <button className="rfs-btn" onClick={() => setMembersOpen(true)}>
                        👥 Crew
                        {members && members.joinRequests.length > 0 && (
                            <span className="rfs-badge">{members.joinRequests.length}</span>
                        )}
                    </button>
                    <button
                        className="rfs-btn rfs-sleep"
                        disabled={!isHost}
                        title={isHost ? 'End the day (E)' : 'Only the host can end the day'}
                        onClick={() => actions.sleep()}
                    >
                        🛏️ Sleep
                    </button>
                    {!isOwnFarm && (
                        <button className="rfs-btn rfs-leave" onClick={() => actions.leaveFarm()}>
                            🚪 Leave
                        </button>
                    )}
                </div>
            </div>

            {/* hotbar */}
            <div className="rfs-hotbar">
                {slots.map((slot, i) => {
                    const active = selKey(slot) === activeKey;
                    if (slot.kind === 'tool') {
                        const lvl = farm?.tools?.[slot.tool] ?? 1;
                        return (
                            <button
                                key={selKey(slot)}
                                className={`rfs-slot ${active ? 'active' : ''}`}
                                onClick={() => setSelection(slot)}
                            >
                                <span className="rfs-slot-num">{i + 1}</span>
                                <span className="rfs-slot-icon">{TOOL_ICONS[slot.tool]}</span>
                                <span className="rfs-slot-lvl">Lv{lvl}</span>
                            </button>
                        );
                    }
                    const def = cropById[slot.cropId];
                    const qty = farm?.seeds?.[slot.cropId] ?? 0;
                    return (
                        <button
                            key={selKey(slot)}
                            className={`rfs-slot ${active ? 'active' : ''}`}
                            onClick={() => setSelection(slot)}
                            title={def?.name}
                        >
                            <span className="rfs-slot-num">{i + 1}</span>
                            <span className="rfs-slot-icon" style={{ color: def?.color }}>
                                🌱
                            </span>
                            <span className="rfs-slot-lvl">×{qty}</span>
                        </button>
                    );
                })}
            </div>

            <div className="rfs-hint">
                WASD / arrows to move · scroll to zoom · click a tile to use your selection · 1-9 to switch · E to sleep
            </div>
        </div>
    );
}

function seasonEmoji(s?: string): string {
    switch (s) {
        case 'summer':
            return '🌻';
        case 'fall':
            return '🍂';
        case 'winter':
            return '❄️';
        default:
            return '🌷';
    }
}
