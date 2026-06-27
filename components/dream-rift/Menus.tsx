'use client';

/**
 * Dream Rift menus: Title, Character Select (singleplayer launch), the public/
 * private Lobby Browser, the Lobby Room, and the end-of-run Result screen.
 * Lobby actions go through lib/dream-rift/net/connection; the store mirrors
 * server lobby state.
 */

import { useEffect, useMemo, useState } from 'react';
import { useDreamRift } from '@/lib/dream-rift/store';
import { CHARACTERS, PLAYER_IDS } from '@/lib/dream-rift/render/sprites';
import { DIFFICULTIES } from '@/lib/dream-rift/constants';
import type { Difficulty, PlayerId } from '@/lib/dream-rift/types';
import {
    browseLobbies,
    connectDreamRift,
    createLobby,
    joinLobby,
    kickPlayer,
    leaveLobby,
    quickplay,
    setLobbyChar,
    setLobbyReady,
    setLobbySettings,
    startLobby,
} from '@/lib/dream-rift/net/connection';
import { SheetPortrait } from './SheetPortrait';
import { useRuntime } from './runtime';

const DIFF_COLOR: Record<Difficulty, string> = {
    easy: '#5fe0b0',
    normal: '#7fdcff',
    hard: '#ffb14d',
    lunatic: '#ff5ccd',
};

function Btn({ children, onClick, variant = 'primary', disabled, className }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; className?: string }) {
    const base = 'rounded-xl px-5 py-3 font-bold tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed';
    const styles =
        variant === 'primary'
            ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-lg shadow-fuchsia-500/20 hover:brightness-110'
            : 'border border-white/15 text-white/80 hover:bg-white/10';
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className ?? ''}`}>
            {children}
        </button>
    );
}

function DiffPicker({ value, onChange, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean }) {
    return (
        <div className="flex gap-2">
            {DIFFICULTIES.map((d) => (
                <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(d)}
                    className="flex-1 rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wider transition disabled:opacity-40"
                    style={{
                        borderColor: value === d ? DIFF_COLOR[d] : 'rgba(255,255,255,0.12)',
                        background: value === d ? `${DIFF_COLOR[d]}22` : 'transparent',
                        color: value === d ? DIFF_COLOR[d] : 'rgba(255,255,255,0.6)',
                    }}
                >
                    {d}
                </button>
            ))}
        </div>
    );
}

function CharCard({ id, selected, onClick }: { id: PlayerId; selected: boolean; onClick: () => void }) {
    const c = CHARACTERS[id];
    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative flex flex-col items-center rounded-2xl border p-3 transition"
            style={{ borderColor: selected ? c.accent : 'rgba(255,255,255,0.1)', background: selected ? `${c.accent}1a` : 'rgba(255,255,255,0.03)' }}
        >
            <SheetPortrait url={c.sheet} frame={1} size={104} className="rounded-lg" />
            <div className="mt-1 text-sm font-black" style={{ color: c.accent }}>
                {c.name}
            </div>
            <div className="text-[10px] text-white/50">{c.title}</div>
            <div className="mt-1 text-[10px] leading-tight text-white/70">{c.shotType}</div>
        </button>
    );
}

// ─── Title ───

export function TitleScreen({ onSingle, onMulti, onLeaderboard, onSettings }: { onSingle: () => void; onMulti: () => void; onLeaderboard: () => void; onSettings: () => void }) {
    const { music, sfx } = useRuntime();
    const [showHelp, setShowHelp] = useState(false);
    useEffect(() => {
        const begin = () => {
            void music.resume();
            void sfx.resume();
            music.play('menu');
            window.removeEventListener('pointerdown', begin);
            window.removeEventListener('keydown', begin);
        };
        window.addEventListener('pointerdown', begin);
        window.addEventListener('keydown', begin);
        return () => {
            window.removeEventListener('pointerdown', begin);
            window.removeEventListener('keydown', begin);
        };
    }, [music, sfx]);

    return (
        <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0118] via-[#1a0f33] to-[#06010f] px-6 py-12 text-center">
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(176,107,255,0.3), transparent 60%)' }} />
            <div className="relative">
                <h1 className="bg-gradient-to-b from-white to-violet-300 bg-clip-text text-6xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(176,107,255,0.5)] md:text-8xl">
                    Dream Rift
                </h1>
                <div className="mt-1 text-xl tracking-[0.4em] text-violet-200/70 md:text-3xl">ドリームリフト</div>
                <p className="mt-4 text-sm text-white/50">A Touhou-style danmaki bullet hell · solo or up to 4 co-op</p>
            </div>
            <div className="relative mt-10 flex w-full max-w-xs flex-col gap-3">
                <Btn onClick={() => { sfx.play('menuSelect'); onSingle(); }}>Single Player</Btn>
                <Btn onClick={() => { sfx.play('menuSelect'); onMulti(); }}>Multiplayer Lobbies</Btn>
                <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onLeaderboard(); }}>Leaderboard</Btn>
                <div className="flex gap-3">
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onSettings(); }} className="flex-1">Settings</Btn>
                    <Btn variant="ghost" onClick={() => setShowHelp(true)} className="flex-1">How to Play</Btn>
                </div>
            </div>
            <p className="relative mt-10 text-[11px] text-white/30">Move: Arrows/WASD · Shoot: Z · Bomb: X · Focus: Shift · Pause: Esc</p>

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
}

function HelpModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
            <div className="max-w-md rounded-2xl border border-white/15 bg-[#120a22] p-6 text-left text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
                <h3 className="mb-3 text-lg font-black text-white">How to Play</h3>
                <ul className="space-y-2">
                    <li>• Your true hitbox is the tiny dot at your center — hold <b>Focus</b> (Shift) to see it and move slowly for precise dodging.</li>
                    <li>• <b>Graze</b> bullets (pass close without dying) for score.</li>
                    <li>• Collect <span className="text-rose-400">P</span> power to strengthen your shots, <span className="text-sky-300">pt</span> for points.</li>
                    <li>• <b>Bomb</b> (X) clears the screen and saves you in a pinch — you even get a brief window to bomb right after being hit.</li>
                    <li>• Capture a boss's <b>spell card</b> by defeating it before the timer runs out.</li>
                    <li>• In co-op you only die from hits on <b>your</b> screen — lag never kills you. The boss fight stays in sync for everyone.</li>
                </ul>
                <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-fuchsia-500/80 py-2 font-bold text-white">
                    Got it
                </button>
            </div>
        </div>
    );
}

// ─── Character Select (singleplayer) ───

export function CharacterSelect({ onStart, onBack }: { onStart: (char: PlayerId, diff: Difficulty) => void; onBack: () => void }) {
    const selectedChar = useDreamRift((s) => s.selectedChar);
    const setSelectedChar = useDreamRift((s) => s.setSelectedChar);
    const difficulty = useDreamRift((s) => s.difficulty);
    const setDifficulty = useDreamRift((s) => s.setDifficulty);
    const { sfx } = useRuntime();

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <h2 className="mb-1 text-2xl font-black text-white">Choose Your Dreamer</h2>
            <p className="mb-5 text-sm text-white/50">Pick a character and a difficulty, then dive into the rift.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {PLAYER_IDS.map((id) => (
                    <CharCard key={id} id={id} selected={selectedChar === id} onClick={() => { sfx.play('menuMove'); setSelectedChar(id); }} />
                ))}
            </div>
            <div className="mx-auto mt-6 w-full max-w-md">
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Difficulty</div>
                <DiffPicker value={difficulty} onChange={setDifficulty} />
            </div>
            <div className="mx-auto mt-6 flex w-full max-w-md gap-3">
                <Btn variant="ghost" onClick={onBack} className="flex-1">
                    Back
                </Btn>
                <Btn onClick={() => { sfx.play('menuSelect'); onStart(selectedChar, difficulty); }} className="flex-[2]">
                    Enter the Rift
                </Btn>
            </div>
        </div>
    );
}

// ─── Lobby Browser ───

export function LobbyBrowser({ onBack }: { onBack: () => void }) {
    const browse = useDreamRift((s) => s.browse);
    const connection = useDreamRift((s) => s.connection);
    const errorMsg = useDreamRift((s) => s.errorMsg);
    const difficulty = useDreamRift((s) => s.difficulty);
    const setDifficulty = useDreamRift((s) => s.setDifficulty);
    const [code, setCode] = useState('');
    const [isPublic, setIsPublic] = useState(true);

    useEffect(() => {
        let active = true;
        connectDreamRift().then(() => {
            if (active) browseLobbies();
        });
        const iv = setInterval(() => browseLobbies(), 4000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, []);

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-black text-white">Multiplayer Lobbies</h2>
                <span className="text-xs text-white/40">{connection === 'connected' ? '● online' : connection}</span>
            </div>
            {errorMsg && <div className="mb-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{errorMsg}</div>}

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-2 text-sm font-bold text-white">Quick Play</div>
                    <p className="mb-3 text-xs text-white/50">Jump into the first open public lobby, or start a new one.</p>
                    <Btn onClick={() => quickplay()} className="w-full">
                        Quick Play
                    </Btn>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-2 text-sm font-bold text-white">Create Lobby</div>
                    <div className="mb-3"><DiffPicker value={difficulty} onChange={setDifficulty} /></div>
                    <label className="mb-3 flex items-center gap-2 text-xs text-white/70">
                        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                        Public (listed &amp; findable)
                    </label>
                    <Btn onClick={() => createLobby({ isPublic, difficulty })} className="w-full">
                        Create
                    </Btn>
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-2 flex items-center gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                        placeholder="ENTER CODE"
                        className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono uppercase tracking-widest text-white placeholder:text-white/30"
                    />
                    <Btn onClick={() => code && joinLobby(code)} disabled={code.length < 4}>
                        Join
                    </Btn>
                </div>
            </div>

            <div className="mt-4 flex-1">
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Public Lobbies</div>
                {browse.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">No open lobbies — create one!</div>
                ) : (
                    <div className="space-y-2">
                        {browse.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => joinLobby(l.code)}
                                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-fuchsia-400/40 hover:bg-white/[0.06]"
                            >
                                <div>
                                    <div className="font-bold text-white">{l.hostName}'s rift</div>
                                    <div className="text-xs text-white/40">
                                        <span className="font-mono">{l.code}</span> · <span style={{ color: DIFF_COLOR[l.difficulty] }}>{l.difficulty}</span>
                                    </div>
                                </div>
                                <div className="text-sm text-white/70">
                                    {l.playerCount}/{l.maxPlayers} 👤
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Btn variant="ghost" onClick={() => { leaveLobby(); onBack(); }} className="mt-4 self-start">
                Back
            </Btn>
        </div>
    );
}

// ─── Lobby Room ───

export function LobbyRoom({ onLeave }: { onLeave: () => void }) {
    const lobby = useDreamRift((s) => s.lobby);
    const selfSocketId = useDreamRift((s) => s.selfSocketId);
    const selectedChar = useDreamRift((s) => s.selectedChar);

    const me = useMemo(() => lobby?.players.find((p) => p.socketId === selfSocketId), [lobby, selfSocketId]);
    const isHost = !!me?.isHost;
    const allReady = !!lobby && lobby.players.filter((p) => !p.isHost).every((p) => p.ready);

    useEffect(() => {
        // sync our preferred character to the lobby once on entering
        if (me && me.charId !== selectedChar) setLobbyChar(selectedChar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lobby?.code]);

    if (!lobby) return null;

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white">Lobby</h2>
                    <div className="text-sm text-white/50">
                        Code <span className="font-mono text-lg tracking-widest text-fuchsia-300">{lobby.code}</span> · {lobby.isPublic ? 'Public' : 'Private'}
                    </div>
                </div>
                <div className="text-right text-xs text-white/50">
                    Difficulty
                    <div className="font-bold uppercase" style={{ color: DIFF_COLOR[lobby.difficulty] }}>
                        {lobby.difficulty}
                    </div>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((slot) => {
                    const p = lobby.players.find((pl) => pl.slot === slot);
                    if (!p)
                        return (
                            <div key={slot} className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-white/30">
                                Open Slot
                            </div>
                        );
                    return (
                        <div key={slot} className="relative flex flex-col items-center rounded-2xl border p-2" style={{ borderColor: p.ready || p.isHost ? '#5fe0b0' : 'rgba(255,255,255,0.12)' }}>
                            <SheetPortrait url={CHARACTERS[p.charId].sheet} frame={1} size={88} className="rounded-lg" />
                            <div className="text-sm font-bold text-white">{p.name}</div>
                            <div className="text-[10px]" style={{ color: CHARACTERS[p.charId].accent }}>
                                {CHARACTERS[p.charId].name}
                            </div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider">
                                {p.isHost ? <span className="text-amber-300">★ Host</span> : p.ready ? <span className="text-emerald-300">Ready</span> : <span className="text-white/40">Not ready</span>}
                            </div>
                            {isHost && !p.isHost && (
                                <button type="button" onClick={() => kickPlayer(slot)} className="absolute right-1 top-1 text-xs text-white/40 hover:text-rose-400">
                                    ✕
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Your Character</div>
            <div className="mb-4 grid grid-cols-4 gap-2">
                {PLAYER_IDS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setLobbyChar(id)}
                        className="rounded-xl border py-2 text-xs font-bold"
                        style={{ borderColor: me?.charId === id ? CHARACTERS[id].accent : 'rgba(255,255,255,0.12)', color: me?.charId === id ? CHARACTERS[id].accent : 'rgba(255,255,255,0.6)' }}
                    >
                        {CHARACTERS[id].name}
                    </button>
                ))}
            </div>

            {isHost && (
                <div className="mb-4">
                    <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Difficulty (host)</div>
                    <DiffPicker value={lobby.difficulty} onChange={(d) => setLobbySettings(d)} />
                </div>
            )}

            <div className="mt-auto flex gap-3">
                <Btn variant="ghost" onClick={() => { leaveLobby(); onLeave(); }} className="flex-1">
                    Leave
                </Btn>
                {isHost ? (
                    <Btn onClick={() => startLobby()} disabled={!allReady} className="flex-[2]">
                        {allReady ? 'Start Run' : 'Waiting for players…'}
                    </Btn>
                ) : (
                    <Btn onClick={() => setLobbyReady(!me?.ready)} className="flex-[2]">
                        {me?.ready ? 'Cancel Ready' : 'Ready Up'}
                    </Btn>
                )}
            </div>
        </div>
    );
}
