'use client';

/**
 * The menu's fighters: two real Source-engine characters (the same SourceFighter /
 * SkeletalFighter and authored boxing clips a match uses) sparring on a loop in a transparent
 * canvas layered over the street scene. Decoration only: `aria-hidden`, no input, no nameplates.
 *
 * Cost control (all decided in lib/kowloon-knockout/render/menuQuality.ts from the Graphics
 * setting and the device): resolution scale and MSAA, a 24-30 fps cap driven by a timer
 * (`frameloop="demand"`, so nothing renders between ticks), no rendering while the tab is hidden
 * or the layer is off-screen, and no layer at all when the setting is Off or Jelly motion is Still.
 * Models are shared with the match through the same GLB cache, so a fight afterwards starts hot.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import Fighter from '@/components/kowloon-knockout/arena/Fighter';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLASS_STATS } from '@/lib/kowloon-knockout/game/fighters/stats';
import type { FighterClass } from '@/lib/kowloon-knockout/game/fighters/types';
import { duelAt, DUEL_PERIOD, cameraDistance } from '@/lib/kowloon-knockout/render/menuDuel';
import { loadFighterRoster } from '@/lib/kowloon-knockout/render/fighter/useFighterRoster';
import { DEFAULT_FIGHTER_MODEL } from '@/lib/kowloon-knockout/render/fighter/models';
import { pickMatchup } from '@/lib/kowloon-knockout/render/menuMatchup';
import { resolveMenuQuality, type MenuQuality } from '@/lib/kowloon-knockout/render/menuQuality';
import { useGraphicsStore } from '@/lib/kowloon-knockout/render/graphicsStore';
import { jellyMotionLevel } from '@/lib/jelly/tiers';

const FOV = 34;
/** Where the fighters' feet land in the canvas, from the top (the street's kerb sits near the bottom). */
const FEET_AT = 0.86;
/** The two seats' identity colours: the card art's hot pink and cyan. */
const SEAT_COLORS = [
    { color: '#ff2e88', accent: '#ff8cc4' },
    { color: '#46e6ff', accent: '#c8f8ff' },
] as const;

function CameraFit() {
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    const size = useThree((s) => s.size);
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        const aspect = size.width / Math.max(1, size.height);
        // A tall phone fits both fighters across a narrow screen: a little tighter than on a desktop.
        const d = cameraDistance(aspect, FOV, aspect < 0.8 ? 2.15 : 2.3);
        const tanHalf = Math.tan((FOV * Math.PI) / 360);
        // Aim so the feet sit FEET_AT of the way down: ndc(feet) = 1 - 2 * FEET_AT.
        const target = (2 * FEET_AT - 1) * d * tanHalf;
        camera.position.set(0.35, target + 0.3, d);
        camera.lookAt(0, target, 0);
        camera.updateProjectionMatrix();
        invalidate();
    }, [camera, size.width, size.height, invalidate]);
    return null;
}

/** Renders on a timer instead of every display frame: demand mode plus an fps cap. */
function FrameDriver({ fps, active }: { fps: number; active: boolean }) {
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => {
        if (!active) return;
        invalidate();
        const id = window.setInterval(() => { if (!document.hidden) invalidate(); }, 1000 / fps);
        return () => window.clearInterval(id);
    }, [fps, active, invalidate]);
    return null;
}

/** A three-point neon rig: a warm key from the front, a hot-pink rim from behind-left and a cyan rim from
 *  behind-right (the card art's two inks), with a violet hemisphere fill so shadows stay plum, not black.
 *  Weak devices keep the key and the pink rim. */
function Rig({ lights }: { lights: MenuQuality['lights'] }) {
    return (
        <>
            <hemisphereLight args={['#9a86d6', '#1a0b24', 0.85]} />
            <directionalLight position={[2.5, 4.5, 4]} intensity={1.6} color="#ffd9c0" />
            <pointLight position={[-3.2, 2.2, -1.4]} intensity={34} color="#ff2e88" distance={14} />
            {lights >= 2 && <pointLight position={[3.4, 2.0, -1.2]} intensity={30} color="#46e6ff" distance={14} />}
            {lights >= 3 && <pointLight position={[0, 0.8, 3.2]} intensity={7} color="#8f5cff" distance={10} />}
        </>
    );
}

function makeFrame(seat: number, modelId: string): RenderFighter {
    const className: FighterClass = seat === 0 ? 'jade_dragon' : 'red_phoenix';
    const s = CLASS_STATS[className];
    return {
        seat, team: seat, className, modelId, displayName: `P${seat + 1}`, ...SEAT_COLORS[seat],
        isLocal: false, x: seat === 0 ? -0.8 : 0.8, z: 0, yaw: seat === 0 ? 0 : Math.PI, state: 'idle', punch: null,
        punchFrame: 0, stateFrame: 0, actionProgress: 0, hitFlash: 0,
        health: s.maxHealth, maxHealth: s.maxHealth, stamina: s.stamina, maxStamina: s.stamina, alive: true,
    };
}

function Duel({ models, onLoop }: { models: [string, string]; onLoop: () => void }) {
    const framesRef = useRef<RenderFighter[]>([makeFrame(0, models[0]), makeFrame(1, models[1])]);
    const clock = useRef(0);
    const loops = useRef(0);
    useFrame((_, delta) => {
        clock.current += Math.min(0.1, delta);
        const now = Math.floor(clock.current / DUEL_PERIOD);
        if (now !== loops.current) { loops.current = now; if (now % 2 === 0) onLoop(); }
        const [a, b] = duelAt(clock.current);
        Object.assign(framesRef.current[0], a);
        Object.assign(framesRef.current[1], b);
    });
    return (
        <>
            <Fighter seat={0} framesRef={framesRef} showNameplate={false} />
            <Fighter seat={1} framesRef={framesRef} showNameplate={false} />
        </>
    );
}

/** True while `data-jelly-motion="still"` (Appearance → Jelly motion): the 3D layer unmounts, the street stays. */
function useStill(): boolean {
    const [still, setStill] = useState(false);
    useEffect(() => {
        const read = () => setStill(jellyMotionLevel() === 'still');
        read();
        if (typeof MutationObserver === 'undefined') return;
        const obs = new MutationObserver(read);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-jelly-motion'] });
        return () => obs.disconnect();
    }, []);
    return still;
}

/** True while any part of the layer is on screen. */
function useOnScreen(ref: React.RefObject<Element | null>): boolean {
    const [on, setOn] = useState(true);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver((entries) => setOn(entries.some((e) => e.isIntersecting)));
        obs.observe(el);
        return () => obs.disconnect();
    }, [ref]);
    return on;
}

export default function MenuFighters3D({ className, models: forced }: {
    className?: string;
    /** Fix the pairing (tests, previews); otherwise it rotates through the roster. */
    models?: [string, string];
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [picked, setModels] = useState<[string, string]>([DEFAULT_FIGHTER_MODEL, DEFAULT_FIGHTER_MODEL]);
    const [roster, setRoster] = useState<string[]>([]);
    const rounds = useRef(0);
    const models = forced ?? picked;

    const setting = useGraphicsStore((s) => s.menuFighters);
    const preference = useGraphicsStore((s) => s.preference);
    const still = useStill();
    const onScreen = useOnScreen(wrapRef);

    useEffect(() => { setMounted(true); }, []);

    const quality = useMemo<MenuQuality | null>(() => {
        if (!mounted) return null;
        const nav = navigator as Navigator & { deviceMemory?: number };
        return resolveMenuQuality({
            setting, preference,
            isMobile: window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640,
            devicePixelRatio: window.devicePixelRatio,
            deviceMemory: nav.deviceMemory,
            hardwareConcurrency: nav.hardwareConcurrency,
        });
    }, [mounted, setting, preference]);

    useEffect(() => {
        if (forced || !quality || quality.mode === 'off') return;
        let alive = true;
        void loadFighterRoster().then((r) => {
            if (!alive) return;
            const ids = r.map((m) => m.id);
            setRoster(ids);
            setModels(pickMatchup(ids, 0));
        });
        return () => { alive = false; };
    }, [forced, quality]);

    // A fresh pairing every other loop (about every 25 s), so the menu doesn't repeat the same two.
    const reroll = useMemo(() => () => {
        rounds.current += 1;
        if (!forced) setModels((cur) => (roster.length ? pickMatchup(roster, rounds.current, cur) : cur));
    }, [roster, forced]);

    if (!quality || quality.mode === 'off' || still) return <div ref={wrapRef} className={className} aria-hidden="true" />;
    const pixel = quality.mode === 'pixel';

    return (
        <div ref={wrapRef} className={className} aria-hidden="true" data-kk-menu-fighters={quality.mode}>
            <Canvas
                // A different AA / resolution needs a fresh context.
                key={quality.mode + (quality.antialias ? 'aa' : '')}
                frameloop="demand"
                dpr={quality.dpr}
                camera={{ fov: FOV, near: 0.1, far: 60, position: [0.35, 1.25, 4.6] }}
                gl={{ antialias: quality.antialias, alpha: true, stencil: false, powerPreference: pixel ? 'low-power' : 'default' }}
                style={{ imageRendering: pixel ? 'pixelated' : 'auto', pointerEvents: 'none' }}
            >
                <CameraFit />
                <FrameDriver fps={quality.fps} active={onScreen} />
                <Rig lights={quality.lights} />
                {/* key = the pairing, so each Fighter's load state starts fresh with its models */}
                <Duel key={models.join('|')} models={models} onLoop={reroll} />
            </Canvas>
        </div>
    );
}
