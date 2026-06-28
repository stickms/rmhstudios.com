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
import { MenuBackdrop } from './MenuBackdrop';
import { useRuntime } from './runtime';

const DIFF_COLOR: Record<Difficulty, string> = {
    easy: '#5fe0b0',
    normal: '#7fdcff',
    hard: '#ffb14d',
    lunatic: '#ff5ccd',
};

function Btn({ children, onClick, variant = 'primary', disabled, className }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; className?: string }) {
    const base = 'dr-plaque rounded-sm px-5 py-3 text-sm font-semibold active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed';
    const styles = variant === 'primary' ? 'dr-plaque-primary' : '';
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
                    className="dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:opacity-40"
                    style={{
                        borderColor: value === d ? DIFF_COLOR[d] : 'rgba(231,205,140,0.22)',
                        background: value === d ? `${DIFF_COLOR[d]}22` : 'transparent',
                        color: value === d ? DIFF_COLOR[d] : 'var(--dr-cream-dim)',
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
            className="group relative flex flex-col items-center rounded-sm border p-3 transition-all duration-150 hover:-translate-y-0.5"
            style={{
                borderColor: selected ? c.accent : 'rgba(231,205,140,0.2)',
                background: selected ? `${c.accent}1f` : 'rgba(11,7,18,0.5)',
                boxShadow: selected ? `inset 0 0 0 1px ${c.accent}55, 0 0 22px ${c.accent}33` : 'inset 0 1px 0 rgba(231,205,140,0.08)',
            }}
        >
            <SheetPortrait url={c.sheet} frame={1} size={104} className="rounded-sm" />
            <div className="dr-serif mt-1 text-sm font-semibold tracking-wide" style={{ color: c.accent }}>
                {c.name}
            </div>
            <div className="dr-serif-body text-[10px] italic text-[color:var(--dr-cream-dim)]">{c.title}</div>
            <div className="mt-1 text-[10px] leading-tight text-[color:var(--dr-cream-dim)]">{c.shotType}</div>
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

    const stagger = (i: number): React.CSSProperties => ({ animationDelay: `${0.12 + i * 0.08}s` });

    return (
        <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0612] via-[#170d22] to-[#06030c] px-6 py-12 text-center">
            {/* animated danmaku backdrop + soft vignette */}
            <MenuBackdrop className="opacity-70" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 26%, rgba(212,64,90,0.22), transparent 56%)' }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(231,205,140,0.12), transparent 48%)' }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 50%, transparent 52%, rgba(4,2,9,0.78) 100%)' }} />

            <div className="relative">
                <h1 className="dr-float dr-title-glow dr-serif bg-gradient-to-b from-[#fff6e2] via-[#e7cd8c] to-[#b78f44] bg-clip-text text-6xl font-black tracking-[0.04em] text-transparent md:text-8xl">
                    Dream Rift
                </h1>
                <div className="dr-rise dr-serif-body mt-2 text-xl tracking-[0.42em] text-[color:var(--dr-gold)] md:text-3xl" style={stagger(0)}>ドリームリフト</div>
                <div className="dr-rise mx-auto mt-3 h-px w-40 dr-rule" style={stagger(1)} />
                <p className="dr-rise dr-serif-body mt-3 text-sm italic text-[color:var(--dr-cream-dim)]" style={stagger(1)}>A danmaku bullet hell · solo or up to 4-player co-op</p>
            </div>

            <div className="relative mt-10 flex w-full max-w-xs flex-col gap-3">
                <div className="dr-rise" style={stagger(2)}>
                    <Btn onClick={() => { sfx.play('menuSelect'); onSingle(); }} className="w-full">Single Player</Btn>
                </div>
                <div className="dr-rise" style={stagger(3)}>
                    <Btn onClick={() => { sfx.play('menuSelect'); onMulti(); }} className="w-full">Multiplayer Lobbies</Btn>
                </div>
                <div className="dr-rise" style={stagger(4)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onLeaderboard(); }} className="w-full">Leaderboard</Btn>
                </div>
                <div className="dr-rise flex gap-3" style={stagger(5)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onSettings(); }} className="flex-1">Settings</Btn>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); setShowHelp(true); }} className="flex-1">How to Play</Btn>
                </div>
            </div>

            <p className="dr-rise relative mt-10 text-[11px] tracking-wide text-[color:var(--dr-cream-faint)]" style={stagger(6)}>Move: Arrows/WASD · Shoot: Z · Bomb: X · Focus: Shift · Pause: Esc · or play by touch</p>

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
}

function HelpModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
            <div className="dr-frame max-w-md rounded-sm p-6 text-left text-sm text-[color:var(--dr-cream)]" onClick={(e) => e.stopPropagation()}>
                <h3 className="dr-serif mb-1 text-lg font-semibold tracking-[0.12em] text-[color:var(--dr-gold)]">How to Play</h3>
                <div className="dr-rule mb-4 mt-2" />
                <ul className="space-y-2 text-[color:var(--dr-cream-dim)]">
                    <li>• Your true hitbox is the tiny dot at your center — hold <b className="text-[color:var(--dr-cream)]">Focus</b> (Shift) to see it and move slowly for precise dodging.</li>
                    <li>• <b className="text-[color:var(--dr-cream)]">Graze</b> bullets (pass close without dying) for score.</li>
                    <li>• Collect <span className="text-[color:var(--dr-crimson)]">P</span> power to strengthen your shots, <span className="text-sky-300">pt</span> for points.</li>
                    <li>• <b className="text-[color:var(--dr-cream)]">Bomb</b> (X) clears the screen and saves you in a pinch — you even get a brief window to bomb right after being hit.</li>
                    <li>• Capture a boss's <b className="text-[color:var(--dr-cream)]">spell card</b> by defeating it before the timer runs out.</li>
                    <li>• In co-op you only die from hits on <b className="text-[color:var(--dr-cream)]">your</b> screen — lag never kills you. The boss fight stays in sync for everyone.</li>
                </ul>
                <button type="button" onClick={onClose} className="dr-plaque dr-plaque-primary mt-5 w-full rounded-sm py-2 text-sm font-semibold">
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
        <div className="relative flex min-h-full flex-col overflow-hidden bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
            <MenuBackdrop className="opacity-40" />
            <h2 className="dr-rise dr-serif relative mb-1 text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">Choose Your Dreamer</h2>
            <p className="dr-rise dr-serif-body relative mb-5 text-sm italic text-[color:var(--dr-cream-dim)]" style={{ animationDelay: '0.06s' }}>Pick a character and a difficulty, then dive into the rift.</p>
            <div className="relative grid grid-cols-2 gap-3 md:grid-cols-4">
                {PLAYER_IDS.map((id) => (
                    <CharCard key={id} id={id} selected={selectedChar === id} onClick={() => { sfx.play('menuMove'); setSelectedChar(id); }} />
                ))}
            </div>
            <div className="mx-auto mt-6 w-full max-w-md">
                <div className="dr-serif mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">Difficulty</div>
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
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="dr-serif text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">Multiplayer Lobbies</h2>
                <span className="text-xs text-[color:var(--dr-cream-dim)]">{connection === 'connected' ? '● online' : connection}</span>
            </div>
            {errorMsg && <div className="mb-3 rounded-sm border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{errorMsg}</div>}

            <div className="grid gap-4 md:grid-cols-2">
                <div className="dr-frame rounded-sm p-4">
                    <div className="dr-serif mb-2 text-sm font-semibold tracking-wide text-[color:var(--dr-gold)]">Quick Play</div>
                    <p className="mb-3 text-xs text-[color:var(--dr-cream-dim)]">Jump into the first open public lobby, or start a new one.</p>
                    <Btn onClick={() => quickplay()} className="w-full">
                        Quick Play
                    </Btn>
                </div>
                <div className="dr-frame rounded-sm p-4">
                    <div className="dr-serif mb-2 text-sm font-semibold tracking-wide text-[color:var(--dr-gold)]">Create Lobby</div>
                    <div className="mb-3"><DiffPicker value={difficulty} onChange={setDifficulty} /></div>
                    <label className="mb-3 flex items-center gap-2 text-xs text-[color:var(--dr-cream-dim)]">
                        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[color:var(--dr-crimson)]" />
                        Public (listed &amp; findable)
                    </label>
                    <Btn onClick={() => createLobby({ isPublic, difficulty })} className="w-full">
                        Create
                    </Btn>
                </div>
            </div>

            <div className="dr-frame mt-4 rounded-sm p-4">
                <div className="mb-0 flex items-center gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                        placeholder="ENTER CODE"
                        className="flex-1 rounded-sm border border-[rgba(231,205,140,0.25)] bg-black/40 px-3 py-2 font-mono uppercase tracking-widest text-[color:var(--dr-cream)] placeholder:text-[color:var(--dr-cream-faint)]"
                    />
                    <Btn onClick={() => code && joinLobby(code)} disabled={code.length < 4}>
                        Join
                    </Btn>
                </div>
            </div>

            <div className="mt-4 flex-1">
                <div className="dr-serif mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">Public Lobbies</div>
                {browse.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-[rgba(231,205,140,0.2)] p-6 text-center text-sm text-[color:var(--dr-cream-faint)]">No open lobbies — create one!</div>
                ) : (
                    <div className="space-y-2">
                        {browse.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => joinLobby(l.code)}
                                className="dr-inset flex w-full items-center justify-between rounded-sm px-4 py-3 text-left transition hover:border-[rgba(231,205,140,0.5)]"
                            >
                                <div>
                                    <div className="dr-serif font-semibold text-[color:var(--dr-cream)]">{l.hostName}'s rift</div>
                                    <div className="text-xs text-[color:var(--dr-cream-faint)]">
                                        <span className="font-mono">{l.code}</span> · <span style={{ color: DIFF_COLOR[l.difficulty] }}>{l.difficulty}</span>
                                    </div>
                                </div>
                                <div className="text-sm text-[color:var(--dr-cream-dim)]">
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
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="dr-serif text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">Lobby</h2>
                    <div className="text-sm text-[color:var(--dr-cream-dim)]">
                        Code <span className="font-mono text-lg tracking-widest text-[color:var(--dr-crimson)]">{lobby.code}</span> · {lobby.isPublic ? 'Public' : 'Private'}
                    </div>
                </div>
                <div className="text-right text-xs text-[color:var(--dr-cream-dim)]">
                    Difficulty
                    <div className="dr-serif font-semibold uppercase tracking-[0.14em]" style={{ color: DIFF_COLOR[lobby.difficulty] }}>
                        {lobby.difficulty}
                    </div>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((slot) => {
                    const p = lobby.players.find((pl) => pl.slot === slot);
                    if (!p)
                        return (
                            <div key={slot} className="flex h-40 flex-col items-center justify-center rounded-sm border border-dashed border-[rgba(231,205,140,0.2)] text-sm text-[color:var(--dr-cream-faint)]">
                                Open Slot
                            </div>
                        );
                    return (
                        <div key={slot} className="dr-inset relative flex flex-col items-center rounded-sm p-2" style={{ borderColor: p.ready || p.isHost ? 'var(--dr-gold)' : 'rgba(231,205,140,0.16)' }}>
                            <SheetPortrait url={CHARACTERS[p.charId].sheet} frame={1} size={88} className="rounded-sm" />
                            <div className="dr-serif text-sm font-semibold text-[color:var(--dr-cream)]">{p.name}</div>
                            <div className="text-[10px]" style={{ color: CHARACTERS[p.charId].accent }}>
                                {CHARACTERS[p.charId].name}
                            </div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider">
                                {p.isHost ? <span className="text-[color:var(--dr-gold)]">★ Host</span> : p.ready ? <span className="text-emerald-300">Ready</span> : <span className="text-[color:var(--dr-cream-faint)]">Not ready</span>}
                            </div>
                            {isHost && !p.isHost && (
                                <button type="button" onClick={() => kickPlayer(slot)} className="absolute right-1 top-1 text-xs text-[color:var(--dr-cream-faint)] hover:text-rose-400">
                                    ✕
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="dr-serif mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">Your Character</div>
            <div className="mb-4 grid grid-cols-4 gap-2">
                {PLAYER_IDS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setLobbyChar(id)}
                        className="dr-serif rounded-sm border py-2 text-xs font-semibold tracking-wide"
                        style={{ borderColor: me?.charId === id ? CHARACTERS[id].accent : 'rgba(231,205,140,0.2)', color: me?.charId === id ? CHARACTERS[id].accent : 'var(--dr-cream-dim)' }}
                    >
                        {CHARACTERS[id].name}
                    </button>
                ))}
            </div>

            {isHost && (
                <div className="mb-4">
                    <div className="dr-serif mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">Difficulty (host)</div>
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
