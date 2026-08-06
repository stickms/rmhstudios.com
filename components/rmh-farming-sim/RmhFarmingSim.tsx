// RMH Farming Simulator — root component. Owns the socket lifecycle and
// switches between the main menu and the live 3D farm.
'use client';

import { useEffect } from 'react';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { actions, connect, disconnect } from '@/lib/rmh-farming-sim/socket';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import MainMenu from './MainMenu';
import FarmCanvas from './FarmCanvas';
import HUD from './HUD';
import ShopPanel from './ShopPanel';
import MembersPanel from './MembersPanel';
import ChatBox from './ChatBox';
import './rmh-farming-sim.css';

function Toasts() {
    const toasts = useRfsStore((s) => s.toasts);
    return (
        <div className="rfs-toasts">
            {toasts.map((t) => (
                <div key={t.id} className={`rfs-toast ${t.kind}`}>
                    {t.message}
                </div>
            ))}
        </div>
    );
}

export default function RmhFarmingSim() {
    const screen = useRfsStore((s) => s.screen);
    const connection = useRfsStore((s) => s.connection);

    useEffect(() => {
        connect().catch(() => {
            /* status handled in store */
        });
        return () => disconnect();
    }, []);

    // Someone was sent a farm link. Knock on that farm's door once we are
    // connected — the host still approves the request, same as a typed code.
    useLobbyInviteJoin(connection === 'connected', (code) =>
        actions.joinFarm(code.toUpperCase()),
    );

    return (
        <div className="rfs-root">
            {screen === 'game' ? (
                <>
                    <div className="rfs-canvas-wrap">
                        <FarmCanvas />
                    </div>
                    <HUD />
                    <ChatBox />
                    <ShopPanel />
                    <MembersPanel />
                </>
            ) : (
                <MainMenu />
            )}
            <Toasts />
        </div>
    );
}
