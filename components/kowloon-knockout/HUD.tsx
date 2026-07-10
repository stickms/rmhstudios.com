'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { HudState, HudFighter } from '@/lib/kowloon-knockout/net/session';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';

const CORNERS = [
    { top: 12, left: 12, align: 'left' as const },
    { top: 12, right: 12, align: 'right' as const },
    { bottom: 84, left: 12, align: 'left' as const },
    { bottom: 84, right: 12, align: 'right' as const },
];

function hpColor(pct: number): string {
    return pct > 0.5 ? '#33ff99' : pct > 0.25 ? '#ffcc00' : '#ff3366';
}

function FighterPanel({ f, corner, mode }: { f: HudFighter; corner: typeof CORNERS[number]; mode: 'ffa' | 'teams' }) {
    const hpPct = Math.max(0, f.health / f.maxHealth);
    const stPct = Math.max(0, f.stamina / f.maxStamina);
    const right = corner.align === 'right';
    const teamColor = mode === 'teams' ? TEAM_COLORS[f.team] ?? f.color : f.color;
    return (
        <div
            style={{
                position: 'absolute', ...corner, width: 'min(34vw, 260px)',
                textAlign: corner.align, opacity: f.alive ? 1 : 0.45,
                filter: f.alive ? 'none' : 'grayscale(0.7)', transition: 'opacity 0.3s',
            }}
        >
            <div style={{
                display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start',
                alignItems: 'center', gap: 6, marginBottom: 3,
            }}>
                {f.isLocal && <span style={{ color: '#ffcc00', fontSize: 9 }}>▶</span>}
                <span style={{ color: teamColor, fontSize: 9, textShadow: `0 0 8px ${teamColor}90`, letterSpacing: 0.5 }}>
                    {f.name}
                </span>
                <span style={{ color: '#ffcc00', fontSize: 8 }}>
                    {'●'.repeat(f.roundWins)}{'○'.repeat(Math.max(0, 2 - f.roundWins))}
                </span>
            </div>
            <div style={{
                height: 12, background: '#0a0a0a', border: `1px solid ${hpColor(hpPct)}`,
                boxShadow: `0 0 6px ${hpColor(hpPct)}70`, position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, [right ? 'right' : 'left']: 0,
                    width: `${hpPct * 100}%`, background: hpColor(hpPct), transition: 'width 0.15s',
                }} />
            </div>
            <div style={{
                height: 4, background: '#0a0a0a', marginTop: 2, position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, [right ? 'right' : 'left']: 0,
                    width: `${stPct * 100}%`, background: '#33ccff',
                }} />
            </div>
        </div>
    );
}

export default function HUD({ hud }: { hud: HudState }) {
    const seconds = Math.max(0, Math.ceil(hud.roundTime / 60));
    // Local fighter first, then the rest, mapped to corners.
    const ordered = [...hud.fighters].sort((a, b) => (a.isLocal ? -1 : 0) - (b.isLocal ? -1 : 0));

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: '"Press Start 2P", monospace' }}>
            {ordered.slice(0, 4).map((f, i) => (
                <FighterPanel key={f.seat} f={f} corner={CORNERS[i]} mode={hud.mode} />
            ))}

            {/* Centre: round + timer */}
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
                <div style={{ color: '#ffcc00', fontSize: 9, textShadow: '0 0 6px #ffcc00' }}>ROUND {hud.round}</div>
                <div style={{
                    color: seconds <= 10 ? '#ff3366' : '#fff', fontSize: 22, marginTop: 4,
                    textShadow: seconds <= 10 ? '0 0 10px #ff3366' : '0 0 8px #fff',
                }}>{seconds}</div>
                <div style={{ color: '#888', fontSize: 7, marginTop: 2 }}>{hud.mode === 'teams' ? 'TEAMS' : 'FREE-FOR-ALL'}</div>
            </div>

            {/* Combo text */}
            <AnimatePresence>
                {hud.comboText && (
                    <motion.div
                        key={hud.comboText}
                        initial={{ scale: 0.4, opacity: 0, y: 0 }}
                        animate={{ scale: 1, opacity: 1, y: -10 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.25 }}
                        style={{
                            position: 'absolute', top: '32%', left: '50%', transform: 'translateX(-50%)',
                            color: hud.comboColor, fontSize: 18, textShadow: `0 0 14px ${hud.comboColor}`,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {hud.comboText}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Countdown */}
            {hud.phase === 'countdown' && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.35)' }}>
                    <motion.div
                        key={hud.countdownValue}
                        initial={{ scale: 1.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        style={{
                            color: hud.countdownValue > 0 ? '#ffcc00' : '#ff3366',
                            fontSize: hud.countdownValue > 0 ? 64 : 44,
                            textShadow: `0 0 24px ${hud.countdownValue > 0 ? '#ffcc00' : '#ff3366'}`,
                        }}
                    >
                        {hud.countdownValue > 0 ? hud.countdownValue : 'FIGHT!'}
                    </motion.div>
                </div>
            )}

            {/* Round end */}
            {hud.phase === 'roundEnd' && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.5)' }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <motion.div
                            initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }}
                            style={{
                                color: hud.roundEndText === 'K.O.' ? '#ff3366' : '#ffcc00',
                                fontSize: 40, textShadow: `0 0 20px ${hud.roundEndText === 'K.O.' ? '#ff3366' : '#ffcc00'}`,
                            }}
                        >
                            {hud.roundEndText}
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
