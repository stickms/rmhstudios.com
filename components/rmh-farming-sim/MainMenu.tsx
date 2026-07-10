// RMH Farming Simulator — start screen: enter your own farm, join another by
// code, or re-open a previously visited farm.
'use client';

import { useState } from 'react';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';

export default function MainMenu() {
    const welcome = useRfsStore((s) => s.welcome);
    const connection = useRfsStore((s) => s.connection);
    const ownCode = useRfsStore((s) => s.ownFarmCode);
    const recents = useRfsStore((s) => s.recents);
    const removeRecent = useRfsStore((s) => s.removeRecent);
    const setScreen = useRfsStore((s) => s.setScreen);
    const [code, setCode] = useState('');

    const ready = connection === 'connected' && !!welcome;
    const needsAuth = connection === 'error' && !welcome;

    const enterOwn = () => setScreen('game');
    const join = (c: string) => {
        const clean = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clean) actions.joinFarm(clean);
    };

    return (
        <div className="rfs-menu">
            <div className="rfs-menu-card">
                <h1 className="rfs-title">
                    RMH <span>Farming Simulator</span>
                </h1>
                <p className="rfs-tagline">Plant, tend, harvest &amp; trade — solo or with friends.</p>

                {!ready && !needsAuth && (
                    <div className="rfs-connect">Connecting to the farm server…</div>
                )}

                {needsAuth && (
                    <div className="rfs-connect rfs-error">
                        Please sign in to play. Your farm and progress are tied to your account.
                    </div>
                )}

                {ready && (
                    <>
                        <div className="rfs-menu-section">
                            <div className="rfs-menu-label">Your Homestead</div>
                            <div className="rfs-own-row">
                                <span className="rfs-own-code">Code: {ownCode}</span>
                                <button className="rfs-big-btn" onClick={enterOwn}>
                                    🌱 Enter My Farm
                                </button>
                            </div>
                        </div>

                        <div className="rfs-menu-section">
                            <div className="rfs-menu-label">Join a Friend&apos;s Farm</div>
                            <div className="rfs-join-row">
                                <input
                                    className="rfs-join-input"
                                    value={code}
                                    placeholder="Enter farm code"
                                    maxLength={8}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') join(code);
                                    }}
                                />
                                <button className="rfs-big-btn" onClick={() => join(code)} disabled={!code.trim()}>
                                    Request to Join
                                </button>
                            </div>
                            <div className="rfs-join-note">
                                The host gets a request and can let you in. Once accepted you&apos;ll drop straight into
                                their farm.
                            </div>
                        </div>

                        {recents.length > 0 && (
                            <div className="rfs-menu-section">
                                <div className="rfs-menu-label">Previously Joined Farms</div>
                                <div className="rfs-recents">
                                    {recents.map((r) => (
                                        <div className="rfs-recent" key={r.code}>
                                            <div className="rfs-recent-main">
                                                <div className="rfs-recent-name">{r.name}</div>
                                                <div className="rfs-recent-sub">
                                                    #{r.code} · host {r.host}
                                                </div>
                                            </div>
                                            <button className="rfs-mini" onClick={() => join(r.code)}>
                                                Rejoin
                                            </button>
                                            <button className="rfs-mini bad" onClick={() => removeRecent(r.code)}>
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
