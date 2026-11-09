import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalInputSource } from '@/lib/kowloon-knockout/game/input';
import type { PunchType } from '@/lib/kowloon-knockout/game/fighters/types';
import { clampOrigin, stickVector } from '@/lib/kowloon-knockout/render/hudModel';
import { hapticsEnabled, vibrate } from '@/lib/shared/platform';
import './kk-hud.css';

const HAND_KEY = 'kk-hand';
type Hand = 'right' | 'left';

function readHand(): Hand {
    try { return window.localStorage.getItem(HAND_KEY) === 'left' ? 'left' : 'right'; } catch { return 'right'; }
}

function tick(ms: number): void {
    if (hapticsEnabled()) vibrate(ms);
}

const PUNCHES: { type: PunchType; cell: string; color: string }[] = [
    { type: 'jab', cell: 'j', color: '#3de8ff' },
    { type: 'hook', cell: 'l', color: '#ffd23f' },
    { type: 'cross', cell: 'k', color: '#ff2d95' },
    { type: 'uppercut', cell: 'u', color: '#ff7a3d' },
];

/**
 * Touch controls: a floating stick (it appears under the thumb) and a clustered action pad.
 * Every control owns its own pointer with capture, so the stick, a punch and a block can all be
 * held at once. Writes into the shared LocalInputSource exactly as the old controls did
 * (setVirtualMove / pressVirtualPunch / setVirtualBlock).
 */
export default function MobileControls({ input }: { input: LocalInputSource }) {
    const { t } = useTranslation('c-kowloon-knockout');
    const [hand, setHand] = useState<Hand>('right');
    useEffect(() => { setHand(readHand()); }, []);
    const swapHand = () => {
        const next: Hand = hand === 'right' ? 'left' : 'right';
        setHand(next);
        try { window.localStorage.setItem(HAND_KEY, next); } catch { /* private mode: not remembered */ }
        input.setVirtualMove(0, 0);
        input.setVirtualBlock(false);
    };

    // A long press must never open the browser's context menu mid-fight. (A listener, not a JSX
    // handler: this layer is not interactive itself, only its controls are.)
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = root.current;
        if (!el) return;
        const stop = (e: Event) => e.preventDefault();
        el.addEventListener('contextmenu', stop);
        return () => el.removeEventListener('contextmenu', stop);
    }, []);

    // ── Floating stick ──
    const zone = useRef<HTMLDivElement>(null);
    const ring = useRef<HTMLDivElement>(null);
    const stickId = useRef<number | null>(null);
    const origin = useRef({ x: 0, y: 0 });
    const radius = useRef(56);
    const [stick, setStick] = useState<{ active: boolean; ox: number; oy: number; kx: number; ky: number }>({
        active: false, ox: 0, oy: 0, kx: 0, ky: 0,
    });

    const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (stickId.current !== null) return;
        const z = zone.current;
        if (!z) return;
        stickId.current = e.pointerId;
        z.setPointerCapture(e.pointerId);
        const rect = z.getBoundingClientRect();
        const ringW = ring.current?.getBoundingClientRect().width ?? 112;
        radius.current = ringW / 2;
        const ox = clampOrigin(e.clientX - rect.left, rect.width, radius.current);
        const oy = clampOrigin(e.clientY - rect.top, rect.height, radius.current);
        origin.current = { x: rect.left + ox, y: rect.top + oy };
        const r = stickVector(e.clientX - origin.current.x, e.clientY - origin.current.y, radius.current);
        setStick({ active: true, ox, oy, kx: r.knobX, ky: r.knobY });
        input.setVirtualMove(r.moveX, r.moveZ);
    };
    const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (stickId.current !== e.pointerId) return;
        const r = stickVector(e.clientX - origin.current.x, e.clientY - origin.current.y, radius.current);
        setStick((s) => ({ ...s, kx: r.knobX, ky: r.knobY }));
        input.setVirtualMove(r.moveX, r.moveZ);
    };
    const stickEnd = useCallback((e?: ReactPointerEvent<HTMLDivElement>) => {
        if (e && stickId.current !== e.pointerId) return;
        stickId.current = null;
        setStick({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
        input.setVirtualMove(0, 0);
    }, [input]);

    // Leaving the screen (or the controls unmounting) must not leave the fighter walking.
    useEffect(() => () => { input.setVirtualMove(0, 0); input.setVirtualBlock(false); }, [input]);

    // ── Action pad ──
    const [down, setDown] = useState<Record<string, boolean>>({});
    const press = (key: string, on: boolean) => setDown((d) => (d[key] === on ? d : { ...d, [key]: on }));

    const punchDown = (type: PunchType) => (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(type, true);
        input.pressVirtualPunch(type);
        tick(12);
    };
    const punchUp = (type: PunchType) => () => press(type, false);

    const blockDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press('block', true);
        input.setVirtualBlock(true);
        tick(8);
    };
    const blockUp = () => { press('block', false); input.setVirtualBlock(false); };

    const labels: Record<PunchType, { short: string; full: string }> = {
        jab: { short: t('pad-jab', { defaultValue: 'JAB' }), full: t('pad-jab-full', { defaultValue: 'Jab' }) },
        cross: { short: t('pad-cross', { defaultValue: 'CRS' }), full: t('pad-cross-full', { defaultValue: 'Cross' }) },
        hook: { short: t('pad-hook', { defaultValue: 'HOK' }), full: t('pad-hook-full', { defaultValue: 'Hook' }) },
        uppercut: { short: t('pad-uppercut', { defaultValue: 'UPR' }), full: t('pad-uppercut-full', { defaultValue: 'Uppercut' }) },
    };

    return (
        // `app-hud` supplies the four device insets, so the stick and the pad are measured from the
        // first pixel the hardware leaves alone. The layer never takes a gesture itself.
        <div
            className={`app-hud kk-controls${hand === 'left' ? ' kk-controls--lefty' : ''}`}
            data-jelly-zone="hud"
            data-jelly-scope="off"
            ref={root}
        >
            <div
                ref={zone}
                className="kk-stick-zone"
                onPointerDown={stickDown}
                onPointerMove={stickMove}
                onPointerUp={stickEnd}
                onPointerCancel={stickEnd}
                onLostPointerCapture={stickEnd}
                role="group"
                aria-label={t('pad-stick', { defaultValue: 'Movement stick' })}
            >
                <div
                    ref={ring}
                    className={`kk-stick${stick.active ? ' is-active' : ''}`}
                    style={stick.active ? ({ '--ox': `${stick.ox}px`, '--oy': `${stick.oy}px` } as CSSProperties) : undefined}
                >
                    <div
                        className="kk-stick__knob"
                        style={{ transform: `translate(calc(-50% + ${stick.kx}px), calc(-50% + ${stick.ky}px))` }}
                    />
                </div>
            </div>

            <div className="kk-pad">
                <button
                    type="button"
                    className="kk-swap"
                    onClick={swapHand}
                    aria-label={t('pad-swap', { defaultValue: 'Swap control sides' })}
                >
                    ⇄
                </button>
                {PUNCHES.map((p) => (
                    <button
                        key={p.type}
                        type="button"
                        className={`kk-btn kk-btn--${p.cell}${down[p.type] ? ' is-down' : ''}`}
                        style={{ '--c': p.color } as CSSProperties}
                        aria-label={labels[p.type].full}
                        onPointerDown={punchDown(p.type)}
                        onPointerUp={punchUp(p.type)}
                        onPointerCancel={punchUp(p.type)}
                        onLostPointerCapture={punchUp(p.type)}
                    >
                        {labels[p.type].short}
                    </button>
                ))}
                <button
                    type="button"
                    className={`kk-btn kk-btn--b${down.block ? ' is-down' : ''}`}
                    style={{ '--c': '#a66bff' } as CSSProperties}
                    aria-label={t('pad-block-full', { defaultValue: 'Block (hold)' })}
                    onPointerDown={blockDown}
                    onPointerUp={blockUp}
                    onPointerCancel={blockUp}
                    onLostPointerCapture={blockUp}
                >
                    {t('pad-block', { defaultValue: 'BLK' })}
                </button>
            </div>
        </div>
    );
}
