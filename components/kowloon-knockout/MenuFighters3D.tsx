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
import { duelAt, duelImpacts, DUEL_PERIOD, cameraDistance } from '@/lib/kowloon-knockout/render/menuDuel';
import { ImpactBus } from '@/lib/kowloon-knockout/render/impact';
import { stepBus } from '@/lib/kowloon-knockout/render/impactStep';
import { MENU_MUTE, muteMaterial, type MutableMaterial } from '@/lib/kowloon-knockout/render/mute';
import { pushMenuTrauma } from '@/lib/kowloon-knockout/menu/menuShake';
import ImpactFx from '@/components/kowloon-knockout/arena/ImpactFx';
import { ImpactProvider } from '@/components/kowloon-knockout/arena/ImpactContext';
import { loadFighterRoster } from '@/lib/kowloon-knockout/render/fighter/useFighterRoster';
import { DEFAULT_FIGHTER_MODEL } from '@/lib/kowloon-knockout/render/fighter/models';
import { pickMatchup } from '@/lib/kowloon-knockout/render/menuMatchup';
import { resolveMenuQuality, type MenuQuality } from '@/lib/kowloon-knockout/render/menuQuality';
import { FrameDriver, NeonRig } from '@/components/kowloon-knockout/arena/SceneKit';
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

/** The camera's resting pose; the impact shake is laid on top of it each frame and never replaces it. */
interface BasePose { x: number; y: number; z: number; targetY: number }

function CameraFit({ base }: { base: React.MutableRefObject<BasePose | null> }) {
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
        base.current = { x: 0.35, y: target + 0.3, z: d, targetY: target };
        camera.position.set(0.35, target + 0.3, d);
        camera.lookAt(0, target, 0);
        camera.fov = FOV;
        camera.updateProjectionMatrix();
        invalidate();
    }, [camera, size.width, size.height, invalidate, base]);
    return null;
}

/**
 * Steps the impact bus and lays its shake (a sideways/up translation and a roll) and field-of-view kick on
 * top of the camera's resting pose. While nothing shakes it does no work.
 */
function MenuCamera({ bus, base }: { bus: ImpactBus; base: React.MutableRefObject<BasePose | null> }) {
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    const wasShaking = useRef(false);
    useFrame((_, delta) => {
        stepBus(bus, delta, performance.now());
        const b = base.current;
        if (!b) return;
        const s = bus.shake();
        const shaking = s.x !== 0 || s.y !== 0 || s.roll !== 0 || bus.fovKick !== 0;
        if (!shaking && !wasShaking.current) return;
        wasShaking.current = shaking;
        camera.position.set(b.x + s.x, b.y + s.y, b.z);
        camera.lookAt(s.x, b.targetY + s.y, 0);
        camera.rotateZ(s.roll);
        const fov = FOV - bus.fovKick;
        if (Math.abs(camera.fov - fov) > 0.005) { camera.fov = fov; camera.updateProjectionMatrix(); }
    });
    return null;
}

/**
 * Quiet set-dressing: patches every material under it ONCE (flagged in userData) to render desaturated and a
 * little darker (lib/kowloon-knockout/render/mute.ts). Models load whenever their download lands, so it looks
 * again every few frames; each material costs nothing after its first patch. Plain WebGL only — the menu's.
 */
function MutedGroup({ children }: { children: React.ReactNode }) {
    const ref = useRef<THREE.Group>(null);
    const frame = useRef(0);
    useFrame(() => {
        frame.current++;
        if (frame.current % 6 !== 1 || !ref.current) return;
        ref.current.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
            if (!m) return;
            for (const mat of Array.isArray(m) ? m : [m]) muteMaterial(mat as unknown as MutableMaterial, MENU_MUTE);
        });
    });
    return <group ref={ref}>{children}</group>;
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

function Duel({ models, onLoop, bus, script }: { models: [string, string]; onLoop: () => void; bus: ImpactBus; script: boolean }) {
    const framesRef = useRef<RenderFighter[]>([makeFrame(0, models[0]), makeFrame(1, models[1])]);
    const clock = useRef(0);
    const loops = useRef(0);
    useFrame((_, delta) => {
        // `script` false holds the first pose (tests and previews that drive the bus by hand).
        if (script) {
            const prev = clock.current;
            clock.current += Math.min(0.1, delta);
            // Every blow that landed since the last frame goes to the bus: the camera, the street, the
            // fighters and the effects all answer it.
            const now = performance.now();
            for (const i of duelImpacts(prev, clock.current)) {
                bus.emit({ ...i, color: i.kind === 'hit' ? SEAT_COLORS[i.attacker].color : undefined }, now);
            }
            const loop = Math.floor(clock.current / DUEL_PERIOD);
            if (loop !== loops.current) { loops.current = loop; if (loop % 2 === 0) onLoop(); }
        }
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

export default function MenuFighters3D({ className, models: forced, bus: injectedBus, script = true }: {
    className?: string;
    /** Fix the pairing (tests, previews); otherwise it rotates through the roster. */
    models?: [string, string];
    /** Use this impact bus instead of making one (a test or preview that fires impacts by hand). */
    bus?: ImpactBus;
    /** false: the duel holds still and fires nothing by itself (pair with `bus`). */
    script?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const bus = useMemo(() => injectedBus ?? new ImpactBus(), [injectedBus]);
    const basePose = useRef<BasePose | null>(null);

    // The 3D layer tells the pixel street when a blow lands, so the street shakes with it.
    useEffect(() => bus.subscribe((_e, prof) => { if (prof.trauma > 0) pushMenuTrauma(prof.trauma, performance.now()); }), [bus]);
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
                <ImpactProvider value={bus}>
                    <CameraFit base={basePose} />
                    <MenuCamera bus={bus} base={basePose} />
                    <FrameDriver fps={quality.fps} active={onScreen} />
                    {/* Quiet lighting and muted materials: the fighters are set-dressing; the hits are the show. */}
                    <NeonRig lights={quality.lights} strength={0.8} muted />
                    <MutedGroup>
                        {/* key = the pairing, so each Fighter's load state starts fresh with its models */}
                        <Duel key={models.join('|')} models={models} onLoop={reroll} bus={bus} script={script} />
                    </MutedGroup>
                    {/* Sparks, rings and flashes stay vivid, and scale with the device. The canvas is transparent
                        over the street, so they add light to it rather than painting over it. */}
                    <ImpactFx sparkCap={quality.lights >= 3 ? (pixel ? 56 : 90) : 36} lite={quality.lights < 3} overTransparent />
                </ImpactProvider>
            </Canvas>
        </div>
    );
}
