// RMH Farming Simulator — shop: buy seeds, sell produce (shipping bin),
// upgrade equipment.
'use client';

import { useState } from 'react';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';
import type { ToolId } from '@/lib/rmh-farming-sim/types';

type Tab = 'buy' | 'sell' | 'upgrade';

function qualityOf(key: string): { cropId: string; label: string; mult: number } {
    const [cropId, q] = key.split('#');
    if (q === 'gold') return { cropId, label: ' (Gold)', mult: 2 };
    if (q === 'silver') return { cropId, label: ' (Silver)', mult: 1.5 };
    return { cropId, label: '', mult: 1 };
}

export default function ShopPanel() {
    const open = useRfsStore((s) => s.shopOpen);
    const setOpen = useRfsStore((s) => s.setShopOpen);
    const crops = useRfsStore((s) => s.crops);
    const cropById = useRfsStore((s) => s.cropById);
    const tools = useRfsStore((s) => s.tools);
    const farm = useRfsStore((s) => s.farm);
    const stats = useRfsStore((s) => s.stats);
    const welcome = useRfsStore((s) => s.welcome);
    const members = useRfsStore((s) => s.members);
    const [tab, setTab] = useState<Tab>('buy');

    if (!open) return null;
    const isHost = members ? members.ownerUserId === welcome?.userId : farm?.id === welcome?.userId;
    const season = stats?.season ?? 'spring';
    const inventory = Object.entries(farm?.inventory ?? {}).filter(([, q]) => q > 0);

    return (
        <div className="rfs-modal-backdrop" onClick={() => setOpen(false)}>
            <div className="rfs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="rfs-modal-head">
                    <h2>🏪 General Store &amp; Shipping</h2>
                    <div className="rfs-modal-money">💰 {stats?.money ?? 0}g</div>
                    <button className="rfs-x" onClick={() => setOpen(false)}>
                        ✕
                    </button>
                </div>

                <div className="rfs-tabs">
                    <button className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>
                        Buy Seeds
                    </button>
                    <button className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>
                        Sell Produce
                    </button>
                    <button className={tab === 'upgrade' ? 'active' : ''} onClick={() => setTab('upgrade')}>
                        Equipment
                    </button>
                </div>

                <div className="rfs-modal-body">
                    {tab === 'buy' && (
                        <div className="rfs-list">
                            {crops.map((c) => {
                                const inSeason = c.seasons.includes(season as never);
                                return (
                                    <div className={`rfs-row ${inSeason ? '' : 'dim'}`} key={c.id}>
                                        <span className="rfs-swatch" style={{ background: c.color }} />
                                        <div className="rfs-row-main">
                                            <div className="rfs-row-name">{c.name}</div>
                                            <div className="rfs-row-sub">
                                                {c.seasons.join(', ')} · grows in {c.growthDays}d
                                                {c.regrowDays ? ` · regrows ${c.regrowDays}d` : ''} · sells {c.sellPrice}g
                                            </div>
                                        </div>
                                        <div className="rfs-row-actions">
                                            <span className="rfs-price">{c.seedPrice}g</span>
                                            <button className="rfs-mini" onClick={() => actions.buySeed(c.id, 1)}>
                                                +1
                                            </button>
                                            <button className="rfs-mini" onClick={() => actions.buySeed(c.id, 10)}>
                                                +10
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {tab === 'sell' && (
                        <div className="rfs-list">
                            {inventory.length === 0 && <div className="rfs-empty">No produce to sell yet. Go harvest!</div>}
                            {inventory.map(([key, qty]) => {
                                const { cropId, label, mult } = qualityOf(key);
                                const def = cropById[cropId];
                                if (!def) return null;
                                const each = Math.round(def.sellPrice * mult);
                                return (
                                    <div className="rfs-row" key={key}>
                                        <span className="rfs-swatch" style={{ background: def.color }} />
                                        <div className="rfs-row-main">
                                            <div className="rfs-row-name">
                                                {def.name}
                                                {label}
                                            </div>
                                            <div className="rfs-row-sub">
                                                {each}g each · you have {qty}
                                            </div>
                                        </div>
                                        <div className="rfs-row-actions">
                                            <button className="rfs-mini" onClick={() => actions.sell(key, 1)}>
                                                Sell 1
                                            </button>
                                            <button className="rfs-mini" onClick={() => actions.sell(key)}>
                                                Sell all
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {tab === 'upgrade' && (
                        <div className="rfs-list">
                            {!isHost && <div className="rfs-empty">Only the farm host can upgrade equipment.</div>}
                            {tools &&
                                (Object.keys(tools) as ToolId[]).map((tid) => {
                                    const def = tools[tid];
                                    const lvl = farm?.tools?.[tid] ?? 1;
                                    const cur = def.upgrades[lvl - 1];
                                    const next = def.upgrades[lvl];
                                    return (
                                        <div className="rfs-row" key={tid}>
                                            <span className="rfs-swatch tool" />
                                            <div className="rfs-row-main">
                                                <div className="rfs-row-name">{def.name}</div>
                                                <div className="rfs-row-sub">
                                                    {cur?.label} (Lv{lvl}) · area radius {cur?.radius}
                                                    {next ? ` → ${next.label}: radius ${next.radius}` : ' · MAX'}
                                                </div>
                                            </div>
                                            <div className="rfs-row-actions">
                                                {next ? (
                                                    <>
                                                        <span className="rfs-price">{next.cost}g</span>
                                                        <button
                                                            className="rfs-mini"
                                                            disabled={!isHost}
                                                            onClick={() => actions.upgradeTool(tid)}
                                                        >
                                                            Upgrade
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="rfs-maxed">Maxed</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
