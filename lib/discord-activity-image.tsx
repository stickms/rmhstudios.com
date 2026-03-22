import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// ─── Font cache (loaded once, kept forever) ──────────────────────────

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;

function loadFonts(): Promise<void> {
    if (fontRegular && fontBold) return Promise.resolve();
    if (fontsLoading) return fontsLoading;

    fontsLoading = Promise.all([
        fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => {
            if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
            return r.arrayBuffer();
        }),
        fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => {
            if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
            return r.arrayBuffer();
        }),
    ]).then(([reg, bold]) => {
        fontRegular = reg;
        fontBold = bold;
    }).catch(err => {
        // Clear the promise so the next call retries instead of returning a rejected promise forever
        fontsLoading = null;
        throw err;
    });

    return fontsLoading;
}

// Eagerly start font loading on module import
loadFonts().catch(() => {});

// ─── Avatar pre-fetch cache ──────────────────────────────────────────
// Satori fetches images via HTTP during render — slow for Discord CDN.
// Pre-fetch avatars as base64 data URIs so satori embeds them instantly.

const avatarCache = new Map<string, { dataUri: string; ts: number }>();
const AVATAR_CACHE_TTL = 10 * 60 * 1000; // 10 min

function avatarUrl(userId: string, avatarHash: string | null): string {
    if (avatarHash) {
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
    }
    const index = Number(BigInt(userId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function fetchAvatarDataUri(url: string): Promise<string> {
    const now = Date.now();
    const cached = avatarCache.get(url);
    if (cached && now - cached.ts < AVATAR_CACHE_TTL) return cached.dataUri;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
        avatarCache.set(url, { dataUri, ts: now });

        // Evict old entries if cache grows too large
        if (avatarCache.size > 200) {
            for (const [key, entry] of avatarCache) {
                if (now - entry.ts > AVATAR_CACHE_TTL) avatarCache.delete(key);
            }
        }

        return dataUri;
    } catch {
        return url; // fallback to remote URL — satori will fetch it
    }
}

// ─── PNG render cache (LRU by URL params) ────────────────────────────

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_CACHE_TTL = 60 * 1000; // 1 min
const PNG_CACHE_MAX = 100;

function getCachedPng(key: string): Buffer | null {
    const entry = pngCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > PNG_CACHE_TTL) {
        pngCache.delete(key);
        return null;
    }
    return entry.png;
}

function setCachedPng(key: string, png: Buffer): void {
    if (pngCache.size >= PNG_CACHE_MAX) {
        // Evict oldest
        const oldest = pngCache.keys().next().value;
        if (oldest !== undefined) pngCache.delete(oldest);
    }
    pngCache.set(key, { png, ts: Date.now() });
}

// ─── Render helper ───────────────────────────────────────────────────

async function renderToPng(element: React.ReactElement, width = 480, height = 240): Promise<Buffer> {
    await loadFonts();

    if (!fontRegular || !fontBold) {
        throw new Error('Fonts not loaded');
    }

    const svg = await satori(element, {
        width,
        height,
        fonts: [
            { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' as const },
            { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
        ],
    });

    // Render at 2x resolution for crisp Discord embeds
    const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: width * 2 } });
    return Buffer.from(resvg.render().asPng());
}

// ─── Shared styles ───────────────────────────────────────────────────

const BG = '#2b2d31';
const SURFACE = '#1e1f22';
const TEXT = '#ffffff';
const MUTED = '#949ba4';
const AMBER = '#f59e0b';
const GREEN = '#34d399';

function Footer({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
            <div style={{
                display: 'flex',
                width: 14, height: 14,
                borderRadius: 3,
                backgroundColor: AMBER,
            }} />
            <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
        </div>
    );
}

function Avatar({ src, size = 56 }: { src: string; size?: number }) {
    return (
        <img
            src={src}
            width={size}
            height={size}
            style={{ borderRadius: '50%', border: `2px solid ${SURFACE}` }}
        />
    );
}

// ─── Daily Puzzle Image ──────────────────────────────────────────────

export async function generateDailyImage(
    userId: string,
    avatarHash: string | null,
    username: string,
    status: 'solving' | 'completed',
): Promise<Buffer> {
    const cacheKey = `daily:${userId}:${avatarHash}:${status}`;
    const cached = getCachedPng(cacheKey);
    if (cached) return cached;

    const avSrc = await fetchAvatarDataUri(avatarUrl(userId, avatarHash));
    const isCompleted = status === 'completed';

    const element = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: BG,
            padding: '28px 32px',
            fontFamily: 'Inter',
            color: TEXT,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
                <Avatar src={avSrc} size={72} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{username}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isCompleted && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 20, height: 20,
                                borderRadius: '50%',
                                backgroundColor: GREEN,
                                fontSize: 12,
                                color: '#000',
                                fontWeight: 700,
                            }}>✓</div>
                        )}
                        <span style={{
                            fontSize: 15,
                            color: isCompleted ? GREEN : MUTED,
                            fontWeight: isCompleted ? 600 : 400,
                        }}>
                            {isCompleted ? 'Completed today\'s puzzle!' : 'Solving today\'s puzzle...'}
                        </span>
                    </div>
                </div>
            </div>

            <Footer label="Lights Out · Daily Puzzle" />
        </div>
    );

    const png = await renderToPng(element);
    setCachedPng(cacheKey, png);
    return png;
}

// ─── Race Image ──────────────────────────────────────────────────────

interface RacePlayer {
    username: string;
    userId: string;
    avatar: string | null;
    status: string;
    moves: number;
    finishedAt: number | null;
}

export async function generateRaceImage(
    players: RacePlayer[],
    phase: string,
    round: number,
    raceMode: string,
    raceStartedAt: number | null,
): Promise<Buffer> {
    // Cache key: stable representation of the visual output
    const cacheKey = `race:${round}:${raceMode}:${phase}:${players.map(p => `${p.userId}:${p.status}:${p.moves}`).join(',')}`;
    const cached = getCachedPng(cacheKey);
    if (cached) return cached;

    const hasResults = round > 0 && players.some(p => p.status === 'solved');
    const isTimed = raceMode !== 'moves';

    // Pre-fetch all avatars in parallel
    const avatarUrls = players.map(p => avatarUrl(p.userId, p.avatar));
    const avatarDataUris = await Promise.all(avatarUrls.map(fetchAvatarDataUri));
    const avMap = new Map(avatarUrls.map((url, i) => [url, avatarDataUris[i]]));

    const getAv = (userId: string, avatar: string | null) => avMap.get(avatarUrl(userId, avatar)) ?? avatarUrl(userId, avatar);

    let element: React.ReactElement;

    if (hasResults) {
        const solved = players
            .filter(p => p.status === 'solved')
            .sort((a, b) =>
                isTimed
                    ? ((a.finishedAt ?? 0) - (b.finishedAt ?? 0)) || (a.moves - b.moves)
                    : (a.moves - b.moves) || ((a.finishedAt ?? 0) - (b.finishedAt ?? 0))
            );
        const dnf = players.filter(p => p.status === 'dnf');
        const ranked = [...solved, ...dnf].slice(0, 4);
        const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze

        element = (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                backgroundColor: BG,
                padding: '24px 32px',
                fontFamily: 'Inter',
                color: TEXT,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>Race Results</span>
                    <span style={{ fontSize: 13, color: MUTED }}>· Round {round} · {isTimed ? 'Timed' : 'Fewest Moves'}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {ranked.map((p, i) => {
                        const isSolved = p.status === 'solved';
                        const place = isSolved ? solved.indexOf(p) : -1;
                        const timeStr = isSolved && p.finishedAt && raceStartedAt
                            ? `${((p.finishedAt - raceStartedAt) / 1000).toFixed(1)}s`
                            : null;

                        return (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '6px 10px',
                                borderRadius: 8,
                                backgroundColor: SURFACE,
                            }}>
                                {isSolved ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        backgroundColor: place < 3 ? medalColors[place] : SURFACE,
                                        border: place >= 3 ? `2px solid ${MUTED}` : 'none',
                                    }}>
                                        <span style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: place < 3 ? '#000' : MUTED,
                                        }}>
                                            {place + 1}
                                        </span>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: 14, width: 24, textAlign: 'center', color: MUTED }}>—</span>
                                )}
                                <Avatar src={getAv(p.userId, p.avatar)} size={28} />
                                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{p.username}</span>
                                <span style={{ fontSize: 13, color: isSolved ? GREEN : '#ef4444', fontFamily: 'Inter' }}>
                                    {isSolved
                                        ? (isTimed && timeStr ? `${timeStr} · ${p.moves}m` : `${p.moves} move${p.moves !== 1 ? 's' : ''}`)
                                        : 'DNF'
                                    }
                                </span>
                            </div>
                        );
                    })}
                </div>

                <Footer label="Lights Out · Race Mode" />
            </div>
        );
    } else {
        const displayPlayers = players.slice(0, 6);

        element = (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                backgroundColor: BG,
                padding: '28px 32px',
                fontFamily: 'Inter',
                color: TEXT,
            }}>
                <span style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Race Lobby</span>
                <span style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>
                    {players.length} player{players.length !== 1 ? 's' : ''} · {isTimed ? 'Timed Race' : 'Fewest Moves'}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div style={{ display: 'flex' }}>
                        {displayPlayers.map((p, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                marginLeft: i > 0 ? -12 : 0,
                            }}>
                                <Avatar src={getAv(p.userId, p.avatar)} size={48} />
                            </div>
                        ))}
                        {players.length > 6 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 48, height: 48,
                                borderRadius: '50%',
                                backgroundColor: SURFACE,
                                border: `2px solid ${BG}`,
                                marginLeft: -12,
                                fontSize: 14,
                                color: MUTED,
                                fontWeight: 600,
                            }}>+{players.length - 6}</div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {displayPlayers.slice(0, 3).map((p, i) => (
                            <span key={i} style={{ fontSize: 13, color: MUTED }}>{p.username}</span>
                        ))}
                        {players.length > 3 && (
                            <span style={{ fontSize: 12, color: MUTED }}>+{players.length - 3} more</span>
                        )}
                    </div>
                </div>

                <Footer label="Lights Out · Race Mode" />
            </div>
        );
    }

    const png = await renderToPng(element);
    setCachedPng(cacheKey, png);
    return png;
}

// ─── Daily Leaderboard Image (for bot channel embeds) ────────────────

export interface LeaderboardParticipant {
    discordId: string;
    username: string;
    status: string;
    moves: number | null;
    ratingEmoji: string | null;
    ratingLabel: string | null;
}

export async function generateLeaderboardImage(
    dateKey: string,
    shapeLabel: string,
    participants: LeaderboardParticipant[],
    isRecap?: boolean,
): Promise<Buffer> {
    const cacheKey = `lb:${dateKey}:${isRecap ? 'r' : 'l'}:${participants.map(p => `${p.discordId}:${p.status}:${p.moves}`).join(',')}`;
    const cached = getCachedPng(cacheKey);
    if (cached) return cached;

    const completed = participants
        .filter(p => p.status === 'completed')
        .sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));
    const playing = participants.filter(p => p.status === 'playing');
    const display = [...completed, ...playing].slice(0, 6);

    // Pre-fetch all avatars in parallel
    const avUrls = display.map(p => avatarUrl(p.discordId, null));
    const avDataUris = await Promise.all(avUrls.map(fetchAvatarDataUri));

    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const rowHeight = 40;
    const headerHeight = 80;
    const footerHeight = 32;
    const imgPadding = 48;
    const imgHeight = Math.max(240, headerHeight + display.length * rowHeight + footerHeight + imgPadding);

    const element = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: BG,
            padding: '24px 32px',
            fontFamily: 'Inter',
            color: TEXT,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                        {isRecap ? 'Daily Recap' : 'Daily Puzzle'}
                    </span>
                    <span style={{ fontSize: 13, color: MUTED }}>{dateKey}</span>
                </div>
                <span style={{ fontSize: 13, color: MUTED }}>
                    {shapeLabel}
                    {' · '}{participants.length} player{participants.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Participant rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {display.map((p, i) => {
                    const isCompleted = p.status === 'completed';
                    const rank = isCompleted ? completed.indexOf(p) : -1;
                    const medal = rank >= 0 && rank < 3 ? medals[rank] : (rank >= 0 ? `#${rank + 1}` : '');

                    return (
                        <div key={i} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '6px 10px',
                            borderRadius: 8,
                            backgroundColor: SURFACE,
                        }}>
                            <span style={{ fontSize: 14, width: 24, textAlign: 'center' }}>
                                {medal || '\u{1F3AE}'}
                            </span>
                            <Avatar src={avDataUris[i]} size={26} />
                            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.username}</span>
                            <span style={{
                                fontSize: 12,
                                color: isCompleted ? GREEN : MUTED,
                            }}>
                                {isCompleted
                                    ? `${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` · ${p.ratingLabel}` : ''}`
                                    : 'solving...'
                                }
                            </span>
                        </div>
                    );
                })}
                {participants.length > 6 && (
                    <span style={{ fontSize: 11, color: MUTED, paddingLeft: 10, marginTop: 2 }}>
                        +{participants.length - 6} more
                    </span>
                )}
            </div>

            <Footer label="Lights Out · rmhstudios.com" />
        </div>
    );

    const png = await renderToPng(element, 520, imgHeight);
    setCachedPng(cacheKey, png);
    return png;
}
