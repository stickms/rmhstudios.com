// RMH Farming Simulator — the in-Canvas 3D world: ground, soil, crops,
// players, follow-camera, local movement + tile interaction.
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Instance, Instances, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { actions } from '@/lib/rmh-farming-sim/socket';
import type { CropDef, HotbarSelection, PresencePlayer } from '@/lib/rmh-farming-sim/types';
import { useKeyboard, isTypingTarget } from '../useKeyboard';

const SEASON_GRASS: Record<string, string> = {
    spring: '#6fbf5a',
    summer: '#54a83a',
    fall: '#b07a36',
    winter: '#d9e6ec',
};
const SEASON_SKY: Record<string, string> = {
    spring: '#bfe8ff',
    summer: '#a8dcff',
    fall: '#ffd9a6',
    winter: '#d2e4f0',
};
const SOIL = new THREE.Color('#5b3d22');
const SOIL_WET = new THREE.Color('#3a2715');
const MOVE_SPEED = 6.5; // tiles per second

// world helpers — tile (x,z) center sits at (x+0.5 - grid/2, ·, z+0.5 - grid/2)
function tileToWorld(x: number, z: number, grid: number): [number, number] {
    return [x + 0.5 - grid / 2, z + 0.5 - grid / 2];
}
function worldToTile(wx: number, wz: number, grid: number): [number, number] {
    return [Math.floor(wx + grid / 2), Math.floor(wz + grid / 2)];
}

// ── Local player + camera + interaction ────────────────────────────
function LocalController({ grid }: { grid: number }) {
    const keys = useKeyboard();
    const { camera, gl } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const pos = useRef({ x: grid / 2, z: grid / 2, dir: 0 });
    const sendAcc = useRef(0);
    const zoom = useRef(1.1);
    const farmId = useRfsStore((s) => s.farm?.id);

    // recenter when switching farms
    useEffect(() => {
        pos.current.x = grid / 2;
        pos.current.z = grid / 2;
    }, [farmId, grid]);

    // zoom on wheel
    useEffect(() => {
        const el = gl.domElement;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoom.current = THREE.MathUtils.clamp(zoom.current + (e.deltaY > 0 ? 0.12 : -0.12), 0.6, 2.2);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [gl]);

    useFrame((_, dt) => {
        const k = keys.current;
        let dx = 0;
        let dz = 0;
        if (!isTypingTarget()) {
            if (k.has('KeyW') || k.has('ArrowUp')) dz -= 1;
            if (k.has('KeyS') || k.has('ArrowDown')) dz += 1;
            if (k.has('KeyA') || k.has('ArrowLeft')) dx -= 1;
            if (k.has('KeyD') || k.has('ArrowRight')) dx += 1;
        }
        if (dx !== 0 || dz !== 0) {
            const len = Math.hypot(dx, dz) || 1;
            const step = (MOVE_SPEED * Math.min(dt, 0.05)) / len;
            pos.current.x = THREE.MathUtils.clamp(pos.current.x + dx * step, 0.2, grid - 0.2);
            pos.current.z = THREE.MathUtils.clamp(pos.current.z + dz * step, 0.2, grid - 0.2);
            pos.current.dir = Math.atan2(dx, -dz);
        }

        // place avatar at the continuous position, not the tile center
        const px = pos.current.x - grid / 2;
        const pz = pos.current.z - grid / 2;
        if (groupRef.current) {
            groupRef.current.position.set(px, 0, pz);
            groupRef.current.rotation.y = pos.current.dir;
        }

        // follow camera (fixed iso-ish offset, scaled by zoom)
        const z = zoom.current;
        camera.position.lerp(new THREE.Vector3(px + 0 * z, 13 * z, pz + 11 * z), 0.12);
        camera.lookAt(px, 0.5, pz);

        // throttled network position update
        sendAcc.current += dt;
        if (sendAcc.current >= 0.1) {
            sendAcc.current = 0;
            actions.move(pos.current.x, pos.current.z, pos.current.dir);
        }
    });

    return (
        <group ref={groupRef}>
            <PlayerAvatar self name="You" />
        </group>
    );
}

// ── Interaction ground plane ───────────────────────────────────────
function InteractionPlane({ grid }: { grid: number }) {
    const hoverRef = useRef<THREE.Mesh>(null);
    const selection = useRfsStore((s) => s.selection);
    const farm = useRfsStore((s) => s.farm);

    const performAt = (tx: number, tz: number) => {
        if (tx < 0 || tz < 0 || tx >= grid || tz >= grid) return;
        const tile = farm?.tiles[tz * grid + tx];
        if (tile?.c?.ready) {
            actions.harvest(tx, tz);
            return;
        }
        const sel: HotbarSelection = selection;
        if (sel.kind === 'seed') {
            actions.plant(tx, tz, sel.cropId);
        } else if (sel.tool === 'hoe') {
            actions.till(tx, tz);
        } else if (sel.tool === 'can') {
            actions.water(tx, tz);
        } else {
            actions.harvest(tx, tz);
        }
    };

    const onMove = (e: ThreeEvent<PointerEvent>) => {
        const [tx, tz] = worldToTile(e.point.x, e.point.z, grid);
        if (tx < 0 || tz < 0 || tx >= grid || tz >= grid) return;
        const [wx, wz] = tileToWorld(tx, tz, grid);
        if (hoverRef.current) {
            hoverRef.current.visible = true;
            hoverRef.current.position.set(wx, 0.06, wz);
        }
    };
    const onOut = () => {
        if (hoverRef.current) hoverRef.current.visible = false;
    };
    const onDown = (e: ThreeEvent<PointerEvent>) => {
        const [tx, tz] = worldToTile(e.point.x, e.point.z, grid);
        performAt(tx, tz);
    };

    return (
        <>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.02, 0]}
                onPointerMove={onMove}
                onPointerOut={onOut}
                onPointerDown={onDown}
            >
                <planeGeometry args={[grid, grid]} />
                <meshBasicMaterial visible={false} />
            </mesh>
            <mesh ref={hoverRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[0.96, 0.96]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.28} depthWrite={false} />
            </mesh>
        </>
    );
}

// ── Soil + crops (instanced) ───────────────────────────────────────
function SoilAndCrops({ grid }: { grid: number }) {
    const tiles = useRfsStore((s) => s.farm?.tiles);
    const cropById = useRfsStore((s) => s.cropById);

    const soil = useMemo(() => {
        const out: { key: number; pos: [number, number, number]; wet: boolean }[] = [];
        if (!tiles) return out;
        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            if (t.t !== 1) continue;
            const x = i % grid;
            const z = Math.floor(i / grid);
            const [wx, wz] = tileToWorld(x, z, grid);
            out.push({ key: i, pos: [wx, 0.04, wz], wet: !!t.c?.watered });
        }
        return out;
    }, [tiles, grid]);

    const crops = useMemo(() => {
        const out: { key: number; pos: [number, number, number]; h: number; color: string; ready: boolean }[] = [];
        if (!tiles) return out;
        for (let i = 0; i < tiles.length; i++) {
            const c = tiles[i].c;
            if (!c) continue;
            const def: CropDef | undefined = cropById[c.id];
            const x = i % grid;
            const z = Math.floor(i / grid);
            const [wx, wz] = tileToWorld(x, z, grid);
            const ratio = c.max > 0 ? c.stage / c.max : 1;
            const h = 0.18 + ratio * 0.8;
            out.push({
                key: i,
                pos: [wx, h / 2 + 0.05, wz],
                h,
                color: def?.color ?? '#88cc66',
                ready: c.ready,
            });
        }
        return out;
    }, [tiles, cropById, grid]);

    return (
        <group>
            {soil.length > 0 && (
                <Instances limit={grid * grid} key={`soil-${soil.length}`}>
                    <boxGeometry args={[0.98, 0.08, 0.98]} />
                    <meshLambertMaterial />
                    {soil.map((s) => (
                        <Instance key={s.key} position={s.pos} color={s.wet ? SOIL_WET : SOIL} />
                    ))}
                </Instances>
            )}

            {crops.map((c) => (
                <group key={c.key} position={c.pos}>
                    <mesh scale={[0.34, c.h, 0.34]}>
                        <boxGeometry />
                        <meshLambertMaterial color={c.color} />
                    </mesh>
                    {c.ready && (
                        <mesh position={[0, c.h / 2 + 0.12, 0]}>
                            <octahedronGeometry args={[0.16, 0]} />
                            <meshBasicMaterial color="#fff36b" />
                        </mesh>
                    )}
                </group>
            ))}
        </group>
    );
}

// ── Players ────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#e0452f', '#4763c9', '#3fae5a', '#d59b2f', '#9a4fd0', '#2fb3b3'];
function colorFor(userId: string): string {
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function PlayerAvatar({ name, self, color }: { name: string; self?: boolean; color?: string }) {
    const c = color ?? (self ? '#ffd24a' : '#e0452f');
    return (
        <group>
            <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.5, 0.7, 0.4]} />
                <meshLambertMaterial color={c} />
            </mesh>
            <mesh position={[0, 1.0, 0]} castShadow>
                <boxGeometry args={[0.42, 0.42, 0.42]} />
                <meshLambertMaterial color="#f0c9a0" />
            </mesh>
            <mesh position={[0, 1.28, 0]}>
                <boxGeometry args={[0.5, 0.16, 0.5]} />
                <meshLambertMaterial color={self ? '#caa23a' : '#7a4a2a'} />
            </mesh>
            <Html position={[0, 1.7, 0]} center distanceFactor={14} pointerEvents="none" wrapperClass="rfs-nametag-wrap">
                <div className={`rfs-nametag ${self ? 'self' : ''}`}>{name}</div>
            </Html>
        </group>
    );
}

function RemotePlayer({ player, grid }: { player: PresencePlayer; grid: number }) {
    const ref = useRef<THREE.Group>(null);
    const target = useRef(new THREE.Vector3(player.x - grid / 2, 0, player.z - grid / 2));
    target.current.set(player.x - grid / 2, 0, player.z - grid / 2);
    useFrame(() => {
        if (!ref.current) return;
        ref.current.position.lerp(target.current, 0.2);
        ref.current.rotation.y = player.dir;
    });
    return (
        <group ref={ref} position={[player.x - grid / 2, 0, player.z - grid / 2]}>
            <PlayerAvatar name={player.name} color={colorFor(player.userId)} />
        </group>
    );
}

function RemotePlayers({ grid }: { grid: number }) {
    const presence = useRfsStore((s) => s.presence);
    const myId = useRfsStore((s) => s.welcome?.userId);
    return (
        <>
            {presence
                .filter((p) => p.userId !== myId)
                .map((p) => (
                    <RemotePlayer key={p.userId} player={p} grid={grid} />
                ))}
        </>
    );
}

// ── Rain ───────────────────────────────────────────────────────────
function Rain({ grid }: { grid: number }) {
    const ref = useRef<THREE.Points>(null);
    const count = 400;
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            arr[i * 3] = (Math.random() - 0.5) * grid;
            arr[i * 3 + 1] = Math.random() * 12;
            arr[i * 3 + 2] = (Math.random() - 0.5) * grid;
        }
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        return g;
    }, [grid]);
    useFrame((_, dt) => {
        const pts = ref.current;
        if (!pts) return;
        const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < count; i++) {
            let y = attr.getY(i) - dt * 14;
            if (y < 0) y = 12;
            attr.setY(i, y);
        }
        attr.needsUpdate = true;
    });
    return (
        <points ref={ref} geometry={geo}>
            <pointsMaterial color="#9fc4e8" size={0.08} transparent opacity={0.6} />
        </points>
    );
}

// ── Root world ─────────────────────────────────────────────────────
export default function FarmWorld() {
    const grid = useRfsStore((s) => s.welcome?.grid ?? s.farm?.grid ?? 24);
    const stats = useRfsStore((s) => s.stats);
    const { scene } = useThree();

    const seasonKey = stats?.season ?? 'spring';
    useEffect(() => {
        scene.background = new THREE.Color(SEASON_SKY[seasonKey] ?? '#bfe8ff');
        scene.fog = new THREE.Fog(SEASON_SKY[seasonKey] ?? '#bfe8ff', 28, 60);
    }, [scene, seasonKey]);

    const grass = SEASON_GRASS[seasonKey] ?? '#6fbf5a';

    return (
        <>
            <ambientLight intensity={0.75} />
            <hemisphereLight args={['#ffffff', '#688a55', 0.55]} />
            <directionalLight position={[10, 18, 6]} intensity={1.1} castShadow />

            {/* base ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[grid, grid]} />
                <meshLambertMaterial color={grass} />
            </mesh>
            {/* border fence ground (darker apron) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
                <planeGeometry args={[grid + 6, grid + 6]} />
                <meshLambertMaterial color="#3f5e34" />
            </mesh>

            <SoilAndCrops grid={grid} />
            <InteractionPlane grid={grid} />
            <LocalController grid={grid} />
            <RemotePlayers grid={grid} />
            {stats?.weather === 'rain' && <Rain grid={grid} />}
        </>
    );
}
