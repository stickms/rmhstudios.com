/**
 * Dream Rift menus: Title, Character Select (singleplayer launch), the public/
 * private Lobby Browser, the Lobby Room, and the end-of-run Result screen.
 * Lobby actions go through features/dream-rift/engine/net/connection; the store mirrors
 * server lobby state.
 *
 * Skin: pixel-art danmaku (docs/game-design-schemes/dream-rift.json), carried by
 * the `.drm-*` classes in ./menus.css and the CSS-only ./MenuBackdrop. The
 * screens, props, store reads and lobby calls are unchanged by the skin.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLobbyInviteJoin, useLobbyLink } from '@/hooks/useLobbyLink';
import { useDreamRift } from '@features/dream-rift/engine/store';
import { CHARACTERS, PLAYER_IDS } from '@features/dream-rift/engine/render/sprites';
import { DIFFICULTIES } from '@features/dream-rift/engine/constants';
import type { Difficulty, PlayerId } from '@features/dream-rift/engine/types';
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
} from '@features/dream-rift/engine/net/connection';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useFocusReturn } from '@/components/shared/useFocusReturn';
import { SheetPortrait } from './SheetPortrait';
import { MenuBackdrop } from './MenuBackdrop';
import { useRuntime } from './runtime';
import { useArrival, useArrivingKeys, ARRIVE } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import './menus.css';

const DIFF_COLOR: Record<Difficulty, string> = {
    easy: '#5fe0b0',
    normal: '#7fdcff',
    hard: '#ffb14d',
    lunatic: '#ff5ccd',
};

function useDiffLabels(): Record<Difficulty, string> {
    const { t } = useTranslation('c-dream-rift');
    return {
        easy: t('menu-diff-easy', { defaultValue: 'easy' }),
        normal: t('menu-diff-normal', { defaultValue: 'normal' }),
        hard: t('menu-diff-hard', { defaultValue: 'hard' }),
        lunatic: t('menu-diff-lunatic', { defaultValue: 'lunatic' }),
    };
}

function Btn({ children, onClick, variant = 'primary', disabled, className }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; className?: string }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={`drm-btn ${variant === 'primary' ? 'drm-btn--primary' : 'drm-btn--ghost'} ${className ?? ''}`}>
            <span className="drm-btn__label">{children}</span>
        </button>
    );
}

function DiffPicker({ value, onChange, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled?: boolean }) {
    const labels = useDiffLabels();
    return (
        <div className="drm-diff">
            {DIFFICULTIES.map((d) => (
                <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    aria-pressed={value === d}
                    onClick={() => onChange(d)}
                    className="drm-chip"
                    style={{ '--drm-diff': DIFF_COLOR[d] } as React.CSSProperties}
                >
                    {labels[d]}
                </button>
            ))}
        </div>
    );
}

function CharCard({ id, selected, onClick }: { id: PlayerId; selected: boolean; onClick: () => void }) {
    const c = CHARACTERS[id];
    return (
        <button type="button" onClick={onClick} aria-pressed={selected} className="drm-char" style={{ '--drm-char': c.accent } as React.CSSProperties}>
            <div className="drm-char__frame">
                <SheetPortrait url={c.sheet} frame={1} size={120} />
            </div>
            <div className="drm-char__name">{c.name}</div>
            <div className="drm-char__title">{c.title}</div>
            <div className="drm-char__shot">{c.shotType}</div>
        </button>
    );
}

// ─── Title ───

export function TitleScreen({ onSingle, onMulti, onLeaderboard, onSettings, onQuit, extra }: { onSingle: () => void; onMulti: () => void; onLeaderboard: () => void; onSettings: () => void; onQuit: () => void; extra?: React.ReactNode }) {
    const { t } = useTranslation('c-dream-rift');
    const { music, sfx } = useRuntime();
    const selectedChar = useDreamRift((s) => s.selectedChar);
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

    const stagger = (i: number): React.CSSProperties => ({ animationDelay: `${0.1 + i * 0.07}s` });
    const sprite = CHARACTERS[selectedChar];

    return (
        <div className="drm-root drm-root--title">
            <MenuBackdrop />

            {/* The dreamer waiting on the horizon, shot lines rising (desktop only). */}
            <div className="drm-sprite" aria-hidden="true">
                <div className="drm-sprite__body">
                    <div className="drm-sprite__shot"><i /><i /><i /></div>
                    <SheetPortrait url={sprite.sheet} frame={1} size={192} className="drm-sprite__img" />
                </div>
                <div className="drm-sprite__shadow" />
            </div>

            <div className="relative">
                <div className="drm-logo-wrap">
                    <h1 className="drm-rise m-0">
                        <img className="drm-logo" src="/images/games/logos/dream-rift.svg" alt={t('title', { defaultValue: 'Dream Rift' })} width={1120} height={556} />
                    </h1>
                </div>
                <p className="drm-rise drm-tagline" style={stagger(1)}>{t('menu-tagline', { defaultValue: 'A danmaku bullet hell · solo or up to 4-player co-op' })}</p>
            </div>

            <div className="drm-menu">
                <div className="drm-rise" style={stagger(2)}>
                    <Btn onClick={() => { sfx.play('menuSelect'); onSingle(); }} className="w-full">{t('menu-single', { defaultValue: 'Single Player' })}</Btn>
                </div>
                <div className="drm-rise" style={stagger(3)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuSelect'); onMulti(); }} className="w-full">{t('menu-multi', { defaultValue: 'Multiplayer Lobbies' })}</Btn>
                </div>
                <div className="drm-rise" style={stagger(4)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onLeaderboard(); }} className="w-full">{t('menu-leaderboard', { defaultValue: 'Leaderboard' })}</Btn>
                </div>
                {extra && <div className="drm-rise" style={stagger(4)}>{extra}</div>}
                <div className="drm-rise drm-menu__row" style={stagger(5)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onSettings(); }} className="flex-1">{t('menu-settings', { defaultValue: 'Settings' })}</Btn>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); setShowHelp(true); }} className="flex-1">{t('menu-how-to-play', { defaultValue: 'How to Play' })}</Btn>
                </div>
                <div className="drm-rise" style={stagger(6)}>
                    <Btn variant="ghost" onClick={() => { sfx.play('menuMove'); onQuit(); }} className="w-full">{t('menu-quit', { defaultValue: 'Quit' })}</Btn>
                </div>
            </div>

            <p className="drm-rise drm-hint" style={stagger(6)}>{t('menu-controls-hint', { defaultValue: 'Move: Arrows/WASD · Shoot: Z · Bomb: X · Focus: Shift · Pause: Esc · or play by touch' })}</p>

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
}

function HelpModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation('c-dream-rift');
    const returnFocus = useFocusReturn();
    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent hideClose onCloseAutoFocus={returnFocus} overlayClassName="bg-black/80" data-liquid-material="off" data-dialog-shell="bare" className="max-w-md gap-0 rounded-none border-0 bg-transparent p-0 shadow-none">
                <div className="drm-dialog">
                    <DialogTitle className="drm-h">{t('menu-help-title', { defaultValue: 'How to Play' })}</DialogTitle>
                    <DialogDescription className="sr-only">{t('menu-help-desc', { defaultValue: 'Controls and rules for Dream Rift.' })}</DialogDescription>
                    <ul className="drm-help">
                        <li>
                            <strong>{t('menu-help-hitbox-term', { defaultValue: 'Hitbox' })}</strong>
                            {t('menu-help-hitbox', { defaultValue: 'Your true hitbox is the tiny dot at your center. Hold Shift (Focus) to see it and move slowly for precise dodging.' })}
                        </li>
                        <li>
                            <strong>{t('menu-help-graze-term', { defaultValue: 'Graze' })}</strong>
                            {t('menu-help-graze', { defaultValue: 'Pass close to bullets without dying to earn score.' })}
                        </li>
                        <li>
                            <strong>{t('menu-help-items-term', { defaultValue: 'Items' })}</strong>
                            {t('menu-help-items', { defaultValue: 'Collect P power to strengthen your shots, and pt for points.' })}
                        </li>
                        <li>
                            <strong>{t('menu-help-bomb-term', { defaultValue: 'Bomb' })}</strong>
                            {t('menu-help-bomb', { defaultValue: 'Press X to clear the screen and save you in a pinch. You even get a brief window to bomb right after being hit.' })}
                        </li>
                        <li>
                            <strong>{t('menu-help-spell-term', { defaultValue: 'Spell cards' })}</strong>
                            {t('menu-help-spell', { defaultValue: 'Capture a boss spell card by defeating it before the timer runs out.' })}
                        </li>
                        <li>
                            <strong>{t('menu-help-coop-term', { defaultValue: 'Co-op' })}</strong>
                            {t('menu-help-coop', { defaultValue: 'You only die from hits on your own screen, so lag never kills you. The boss fight stays in sync for everyone.' })}
                        </li>
                    </ul>
                    <DialogClose className="drm-btn drm-btn--primary w-full">
                        <span className="drm-btn__label">{t('menu-help-ok', { defaultValue: 'Got it' })}</span>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Character Select (singleplayer) ───

export function CharacterSelect({ onStart, onBack }: { onStart: (char: PlayerId, diff: Difficulty) => void; onBack: () => void }) {
    const { t } = useTranslation('c-dream-rift');
    const selectedChar = useDreamRift((s) => s.selectedChar);
    const setSelectedChar = useDreamRift((s) => s.setSelectedChar);
    const difficulty = useDreamRift((s) => s.difficulty);
    const setDifficulty = useDreamRift((s) => s.setDifficulty);
    const { sfx } = useRuntime();

    return (
        <div className="drm-root">
            <MenuBackdrop className="drm-backdrop--dim" />
            <div className="drm-col">
                <h2 className="drm-rise drm-h">{t('menu-choose-title', { defaultValue: 'Choose Your Dreamer' })}</h2>
                <p className="drm-rise drm-sub" style={{ animationDelay: '0.06s' }}>{t('menu-choose-hint', { defaultValue: 'Pick a character and a difficulty, then dive into the rift.' })}</p>
                <div className="drm-chars">
                    {PLAYER_IDS.map((id) => (
                        <CharCard key={id} id={id} selected={selectedChar === id} onClick={() => { sfx.play('menuMove'); setSelectedChar(id); }} />
                    ))}
                </div>
                <div className="mx-auto mt-8 w-full max-w-md">
                    <div className="drm-label">{t('menu-difficulty', { defaultValue: 'Difficulty' })}</div>
                    <DiffPicker value={difficulty} onChange={setDifficulty} />
                </div>
                <div className="mx-auto mt-8 flex w-full max-w-md gap-4">
                    <Btn variant="ghost" onClick={onBack} className="flex-1">
                        {t('menu-back', { defaultValue: 'Back' })}
                    </Btn>
                    <Btn onClick={() => { sfx.play('menuSelect'); onStart(selectedChar, difficulty); }} className="flex-[2]">
                        {t('menu-enter-rift', { defaultValue: 'Enter the Rift' })}
                    </Btn>
                </div>
            </div>
        </div>
    );
}

// ─── Lobby Browser ───

export function LobbyBrowser({ onBack }: { onBack: () => void }) {
    const { t } = useTranslation('c-dream-rift');
    const browse = useDreamRift((s) => s.browse);
    // The hub's lobby list lands after the screen shows, and grows while it is open (M9).
    const browseArrival = useArrival(browse.length > 0);
    const isNewLobby = useArrivingKeys(browse.map((l) => l.code));
    const connection = useDreamRift((s) => s.connection);
    const errorMsg = useDreamRift((s) => s.errorMsg);
    const difficulty = useDreamRift((s) => s.difficulty);
    const setDifficulty = useDreamRift((s) => s.setDifficulty);
    const [code, setCode] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const labels = useDiffLabels();

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

    // Someone followed an invite link here rather than reading a code off the
    // browser list — join it as soon as the socket is up.
    useLobbyInviteJoin(connection === 'connected', (code) => joinLobby(code.toUpperCase()));

    return (
        <div className="drm-root">
            <MenuBackdrop className="drm-backdrop--dim" />
            <div className="drm-col drm-col--narrow">
                <div className="drm-head">
                    <h2 className="drm-h">{t('menu-lobbies-title', { defaultValue: 'Multiplayer Lobbies' })}</h2>
                    <span className="drm-status" data-on={connection === 'connected'}>{connection === 'connected' ? t('menu-online', { defaultValue: 'online' }) : connection}</span>
                </div>
                {errorMsg && <div className="drm-error" role="alert">{errorMsg}</div>}

                <div className="drm-grid2">
                    <div className="drm-panel">
                        <div className="drm-panel-title">{t('menu-quickplay-title', { defaultValue: 'Quick Play' })}</div>
                        <p className="drm-muted mb-4 mt-0 text-[15px] leading-snug">{t('menu-quickplay-desc', { defaultValue: 'Jump into the first open public lobby, or start a new one.' })}</p>
                        <Btn onClick={() => quickplay()} className="w-full">
                            {t('menu-quickplay-title', { defaultValue: 'Quick Play' })}
                        </Btn>
                    </div>
                    <div className="drm-panel">
                        <div className="drm-panel-title">{t('menu-create-title', { defaultValue: 'Create Lobby' })}</div>
                        <div className="mb-4"><DiffPicker value={difficulty} onChange={setDifficulty} /></div>
                        <label className="drm-check">
                            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                            {t('menu-public-check', { defaultValue: 'Public (listed & findable)' })}
                        </label>
                        <Btn onClick={() => createLobby({ isPublic, difficulty })} className="w-full">
                            {t('menu-create', { defaultValue: 'Create' })}
                        </Btn>
                    </div>
                </div>

                <div className="drm-panel drm-panel--flat mt-5">
                    <div className="drm-join">
                        <label className="sr-only" htmlFor="drm-lobby-code">{t('menu-code-label', { defaultValue: 'Lobby code' })}</label>
                        <input
                            id="drm-lobby-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                            placeholder={t('menu-code-placeholder', { defaultValue: 'ENTER CODE' })}
                            autoComplete="off"
                            spellCheck={false}
                            className="drm-field"
                        />
                        <Btn onClick={() => code && joinLobby(code)} disabled={code.length < 4}>
                            {t('menu-join', { defaultValue: 'Join' })}
                        </Btn>
                    </div>
                </div>

                <div className="mt-7">
                    <div className="drm-label">{t('menu-public-lobbies', { defaultValue: 'Public Lobbies' })}</div>
                    {browse.length === 0 ? (
                        <div className="drm-empty">{t('menu-no-lobbies', { defaultValue: 'No open lobbies — create one!' })}</div>
                    ) : (
                        <div className={cn('drm-list', browseArrival)}>
                            {browse.map((l) => (
                                <button
                                    key={l.code}
                                    type="button"
                                    onClick={() => joinLobby(l.code)}
                                    className={cn('drm-row', isNewLobby(l.code) && ARRIVE)}
                                >
                                    <div className="min-w-0">
                                        <div className="drm-row__name">{t('menu-lobby-rift', { defaultValue: "{{name}}'s rift", name: l.hostName })}</div>
                                        <div className="drm-row__meta">
                                            {l.code} · <span style={{ color: DIFF_COLOR[l.difficulty] }}>{labels[l.difficulty]}</span>
                                        </div>
                                    </div>
                                    <div className="drm-count">
                                        <span>{l.playerCount}/{l.maxPlayers}</span>
                                        <span className="drm-pip" aria-hidden="true" />
                                        <span className="sr-only">{t('menu-players', { defaultValue: 'players' })}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <Btn variant="ghost" onClick={() => { leaveLobby(); onBack(); }} className="mt-7">
                    {t('menu-back', { defaultValue: 'Back' })}
                </Btn>
            </div>
        </div>
    );
}

// ─── Lobby Room ───

export function LobbyRoom({ onLeave }: { onLeave: () => void }) {
    const { t } = useTranslation('c-dream-rift');
    const lobby = useDreamRift((s) => s.lobby);
    const selfSocketId = useDreamRift((s) => s.selfSocketId);
    const selectedChar = useDreamRift((s) => s.selectedChar);

    const me = useMemo(() => lobby?.players.find((p) => p.socketId === selfSocketId), [lobby, selfSocketId]);
    const isHost = !!me?.isHost;
    const allReady = !!lobby && lobby.players.filter((p) => !p.isHost).every((p) => p.ready);
    const { copied: linkCopied, copyLink } = useLobbyLink({ code: lobby?.code });
    const labels = useDiffLabels();

    useEffect(() => {
        // sync our preferred character to the lobby once on entering
        if (me && me.charId !== selectedChar) setLobbyChar(selectedChar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lobby?.code]);

    if (!lobby) return null;

    return (
        <div className="drm-root">
            <MenuBackdrop className="drm-backdrop--dim" />
            <div className="drm-col flex grow flex-col">
                <div className="drm-head">
                    <div>
                        <h2 className="drm-h">{t('menu-room-title', { defaultValue: 'Lobby' })}</h2>
                        <div className="drm-roomline">
                            <span>{t('menu-code', { defaultValue: 'Code' })}</span>
                            <span className="drm-code">{lobby.code}</span>
                            <span>· {lobby.isPublic ? t('menu-public-state', { defaultValue: 'Public' }) : t('menu-private-state', { defaultValue: 'Private' })}</span>
                        </div>
                        <button type="button" onClick={() => void copyLink()} className="drm-btn drm-btn--ghost mt-4">
                            <span className="drm-btn__label">{linkCopied ? t('menu-link-copied', { defaultValue: 'Invite link copied' }) : t('menu-copy-link', { defaultValue: 'Copy invite link' })}</span>
                        </button>
                    </div>
                    <div className="drm-head__end">
                        <div className="drm-label justify-end">{t('menu-difficulty', { defaultValue: 'Difficulty' })}</div>
                        <div className="drm-row__name" style={{ color: DIFF_COLOR[lobby.difficulty] }}>
                            {labels[lobby.difficulty].toUpperCase()}
                        </div>
                    </div>
                </div>

                <div className="drm-slots">
                    {[0, 1, 2, 3].map((slot) => {
                        const p = lobby.players.find((pl) => pl.slot === slot);
                        if (!p)
                            return (
                                <div key={slot} className="drm-slot drm-slot--open drm-empty">
                                    {t('menu-open-slot', { defaultValue: 'Open Slot' })}
                                </div>
                            );
                        const lit = p.ready || p.isHost;
                        return (
                            <div key={slot} className="drm-slot drm-slot--taken" style={{ '--drm-slot-edge': lit ? CHARACTERS[p.charId].accent : '#3a1a72' } as React.CSSProperties}>
                                <div className="drm-char__frame">
                                    <SheetPortrait url={CHARACTERS[p.charId].sheet} frame={1} size={88} />
                                </div>
                                <div className="drm-slot__name" title={p.name}>{p.name}</div>
                                <div className="drm-slot__char" style={{ color: CHARACTERS[p.charId].accent }}>
                                    {CHARACTERS[p.charId].name}
                                </div>
                                <div className="drm-slot__state">
                                    {p.isHost ? <span style={{ color: '#ffe46b' }}>★ {t('menu-host', { defaultValue: 'Host' })}</span> : p.ready ? <span style={{ color: '#7dffc0' }}>{t('menu-ready', { defaultValue: 'Ready' })}</span> : <span className="drm-muted">{t('menu-not-ready', { defaultValue: 'Not ready' })}</span>}
                                </div>
                                {isHost && !p.isHost && (
                                    <button type="button" onClick={() => kickPlayer(slot)} aria-label={t('menu-remove', { defaultValue: 'Remove {{name}}', name: p.name })} className="drm-kick">
                                        <span aria-hidden="true">✕</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="drm-label">{t('menu-your-char', { defaultValue: 'Your Character' })}</div>
                <div className="drm-picks mb-5">
                    {PLAYER_IDS.map((id) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setLobbyChar(id)}
                            aria-pressed={me?.charId === id}
                            className="drm-chip"
                            style={{ '--drm-diff': CHARACTERS[id].accent } as React.CSSProperties}
                        >
                            {CHARACTERS[id].name}
                        </button>
                    ))}
                </div>

                {isHost && (
                    <div className="mb-5">
                        <div className="drm-label">{t('menu-difficulty-host', { defaultValue: 'Difficulty (host)' })}</div>
                        <DiffPicker value={lobby.difficulty} onChange={(d) => setLobbySettings(d)} />
                    </div>
                )}

                <div className="drm-actions">
                    <Btn variant="ghost" onClick={() => { leaveLobby(); onLeave(); }} className="flex-1">
                        {t('menu-leave', { defaultValue: 'Leave' })}
                    </Btn>
                    {isHost ? (
                        <Btn onClick={() => startLobby()} disabled={!allReady} className="flex-[2]">
                            {allReady ? t('menu-start-run', { defaultValue: 'Start Run' }) : t('menu-waiting', { defaultValue: 'Waiting for players…' })}
                        </Btn>
                    ) : (
                        <Btn onClick={() => setLobbyReady(!me?.ready)} className="flex-[2]">
                            {me?.ready ? t('menu-cancel-ready', { defaultValue: 'Cancel Ready' }) : t('menu-ready-up', { defaultValue: 'Ready Up' })}
                        </Btn>
                    )}
                </div>
            </div>
        </div>
    );
}
