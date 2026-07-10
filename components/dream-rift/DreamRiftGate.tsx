'use client';

/**
 * DreamRiftGate — top-level entry for the Dream Rift game.
 *
 * Owns screen routing (title → char-select/lobby → playing → results),
 * builds the per-run StartInfo for both singleplayer (LocalTransport) and
 * multiplayer (SocketTransport, driven by the server's start payload), and
 * hosts the shared runtime. Guests can play; sign-in is only needed to submit
 * scores.
 */

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useDreamRift } from '@/lib/dream-rift/store';
import { LocalTransport, SocketTransport } from '@/lib/dream-rift/net/transport';
import { disconnectDreamRift, leaveLobby, setStartHandler } from '@/lib/dream-rift/net/connection';
import type { StartPayload } from '@/lib/dream-rift/net/events';
import type { Difficulty, PlayerId } from '@/lib/dream-rift/types';
import { DreamRiftRuntimeProvider } from './runtime';
import { GameStage, type StartInfo } from './GameStage';
import { TitleScreen, CharacterSelect, LobbyBrowser, LobbyRoom } from './Menus';
import { ResultScreen } from './Results';
import { Leaderboard } from './Leaderboard';
import { SettingsScreen } from './SettingsScreen';

function randomSeed(): number {
    return Math.floor(Math.random() * 0x7fffffff) || 1;
}

export function DreamRiftGate() {
    return (
        <DreamRiftRuntimeProvider>
            <ScreenRouter />
        </DreamRiftRuntimeProvider>
    );
}

function ScreenRouter() {
    const screen = useDreamRift((s) => s.screen);
    const mode = useDreamRift((s) => s.mode);
    const setScreen = useDreamRift((s) => s.setScreen);
    const setMode = useDreamRift((s) => s.setMode);
    const setResult = useDreamRift((s) => s.setResult);
    const session = authClient.useSession();

    const [startInfo, setStartInfo] = useState<StartInfo | null>(null);

    // multiplayer: server tells us when the run begins
    useEffect(() => {
        setStartHandler((p: StartPayload) => {
            const isHost = p.roster.find((r) => r.slot === p.yourSlot)?.isHost ?? false;
            useDreamRift.getState().setDifficulty(p.difficulty);
            setStartInfo({
                transport: new SocketTransport(isHost, p.yourSlot),
                roster: p.roster.map((r) => ({ ...r, isLocal: r.slot === p.yourSlot })),
                difficulty: p.difficulty as Difficulty,
                seed: p.seed,
            });
            useDreamRift.getState().setResult(null);
            useDreamRift.getState().setPaused(false);
            useDreamRift.getState().setScreen('playing');
        });
        return () => setStartHandler(null);
    }, []);

    const startSingle = useCallback(
        (char: PlayerId, difficulty: Difficulty) => {
            const name = session.data?.user?.name || 'Dreamer';
            setStartInfo({
                transport: new LocalTransport(),
                roster: [{ slot: 0, userId: session.data?.user?.id || 'local', name, charId: char, isHost: true, isLocal: true }],
                difficulty,
                seed: randomSeed(),
            });
            setMode('single');
            setResult(null);
            useDreamRift.getState().setPaused(false);
            setScreen('playing');
        },
        [session.data?.user, setMode, setResult, setScreen],
    );

    const exitToMenu = useCallback(() => {
        setStartInfo(null);
        setResult(null);
        useDreamRift.getState().setPaused(false);
        if (mode === 'multi') {
            leaveLobby();
            setScreen('lobby-browser');
        } else {
            setScreen('title');
        }
    }, [mode, setResult, setScreen]);

    const retry = useCallback(() => {
        setResult(null);
        if (mode === 'multi') {
            setScreen('lobby-browser');
            setStartInfo(null);
        } else if (startInfo) {
            setStartInfo({ ...startInfo, transport: new LocalTransport(), seed: randomSeed() });
            useDreamRift.getState().setPaused(false);
            setScreen('playing');
        }
    }, [mode, startInfo, setResult, setScreen]);

    const fullExit = () => {
        disconnectDreamRift();
        window.location.href = '/create?tab=games';
    };

    let body: React.ReactNode;
    switch (screen) {
        case 'playing':
            body = startInfo ? <GameStage start={startInfo} onExit={exitToMenu} /> : <Loading />;
            break;
        case 'char-select':
            body = <CharacterSelect onStart={startSingle} onBack={() => setScreen('title')} />;
            break;
        case 'lobby-browser':
            body = <LobbyBrowser onBack={() => { setMode('single'); setScreen('title'); }} />;
            break;
        case 'lobby':
            body = <LobbyRoom onLeave={() => setScreen('lobby-browser')} />;
            break;
        case 'game-over':
        case 'victory':
            body = <ResultScreen onRetry={retry} onMenu={exitToMenu} onLeaderboard={() => setScreen('leaderboard')} />;
            break;
        case 'leaderboard':
            body = <Leaderboard onBack={() => setScreen(mode === 'multi' ? 'lobby-browser' : 'title')} />;
            break;
        case 'settings':
            body = <SettingsScreen onBack={() => setScreen('title')} />;
            break;
        default:
            body = (
                <TitleScreen
                    onSingle={() => setScreen('char-select')}
                    onMulti={() => { setMode('multi'); setScreen('lobby-browser'); }}
                    onLeaderboard={() => setScreen('leaderboard')}
                    onSettings={() => setScreen('settings')}
                />
            );
    }

    const showExit = screen !== 'playing';

    return (
        <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-black text-white">
            <div className="h-full w-full overflow-auto">{body}</div>
            {showExit && (
                <button type="button" onClick={fullExit} className="dr-serif absolute right-3 top-3 z-50 rounded-sm border border-[rgba(231,205,140,0.3)] bg-black/40 px-3 py-1.5 text-xs tracking-wider text-[color:var(--dr-cream-dim)] backdrop-blur transition hover:border-[rgba(231,205,140,0.6)] hover:text-[color:var(--dr-cream)]">
                    ✕ Exit
                </button>
            )}
        </div>
    );
}

function Loading() {
    return (
        <div className="flex min-h-full items-center justify-center bg-black">
            <div className="dr-serif animate-pulse text-sm tracking-[0.3em] text-[color:var(--dr-gold-soft)]">ENTERING THE RIFT…</div>
        </div>
    );
}
