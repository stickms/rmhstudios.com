import { use, useRef, useLayoutEffect, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, CLIP_KEYS, type ClipKey } from '@/lib/kowloon-knockout/render/fighter/clips';
import { resolveClip } from '@/lib/kowloon-knockout/render/fighter/stateMachine';
import { useFighterMotion } from './useFighterMotion';
import { autoScaleToHeight, lateralYaw } from '@/lib/kowloon-knockout/render/fighter/fighterRig';
import { resolveRig } from '@/lib/kowloon-knockout/render/fighter/boneMaps';
import { buildSourceClips } from '@/lib/kowloon-knockout/render/fighter/sourceClips';
import { applyFists } from '@/lib/kowloon-knockout/render/fighter/fingers';
import { getFighterModel } from '@/lib/kowloon-knockout/render/fighter/models';
import { loadSourceModel, loadTf2NativeWalk } from '@/lib/kowloon-knockout/render/fighter/sourceModels';
import { modelFrame } from '@/lib/tf2-game/render/model-axes';
import FighterTrappings from './FighterTrappings';

type FramesRef = MutableRefObject<RenderFighter[]>;

const TARGET_HEIGHT = 1.8;

interface Instance {
    model: THREE.Group;
    mixer: THREE.AnimationMixer;
    actions: Partial<Record<ClipKey, THREE.AnimationAction>>;
    emissiveMats: THREE.MeshStandardMaterial[];
    dispose: () => void;
}

/** Zero the hips' ground-plane drift in a native clip: the sim owns where a fighter stands. */
function stripHipsXZ(clip: THREE.AnimationClip, hipsName: string): THREE.AnimationClip {
    const c = clip.clone();
    for (const t of c.tracks) {
        if (t.name !== `${hipsName}.position`) continue;
        for (let i = 0; i < t.values.length; i += 3) { t.values[i] = 0; t.values[i + 2] = 0; }
    }
    return c;
}

/** Source skins are viewed at a grazing angle in a wide arena: 4x anisotropic filtering keeps them crisp
 *  where mipmaps alone would smear. Textures are shared between seats, so each is touched once. */
function sharpenTextures(mat: THREE.MeshStandardMaterial): void {
    for (const tex of [mat.map, mat.normalMap, mat.emissiveMap, mat.roughnessMap, mat.metalnessMap]) {
        if (tex && tex.anisotropy < 4) { tex.anisotropy = 4; tex.needsUpdate = true; }
    }
}

function configure(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, key: ClipKey) {
    const a = mixer.clipAction(clip);
    if (!CLIPS[key].loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    return a;
}

/**
 * A fighter drawn with a Source-engine character from R2, animated by clips authored for
 * the boxing moveset (sourceClips.ts) — plus the game's own run cycle for TF2 classes.
 * Suspends while the model downloads (Fighter shows a placeholder meanwhile) and throws if
 * it cannot load (Fighter falls back to the Y-Bot).
 */
export default function SourceFighter({ seat, framesRef, modelId, showNameplate = true }: {
    seat: number; framesRef: FramesRef; modelId: string; showNameplate?: boolean;
}) {
    const def = getFighterModel(modelId);
    const gltf = use(loadSourceModel(def));

    const initial = framesRef.current.find((f) => f.seat === seat);
    const accentHex = initial?.accent ?? '#ffffff';
    const plateColor = initial?.isLocal ? '#ffcc00' : accentHex;

    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);
    const ring = useRef<THREE.Mesh>(null);
    const modelHost = useRef<THREE.Group>(null);
    const instance = useRef<Instance | null>(null);
    const motion = useFighterMotion(seat);

    useLayoutEffect(() => {
        const host = modelHost.current;
        if (!host || !def.family) return;
        host.updateMatrixWorld(true);

        const scaleGroup = new THREE.Group();
        // Between the scale and the model frame: a turn that puts the skeleton's left on +X.
        const yawGroup = new THREE.Group();
        const frameGroup = new THREE.Group();
        frameGroup.matrixAutoUpdate = false;
        frameGroup.matrix.copy(modelFrame(gltf.scene).matrix);
        const model = cloneSkeleton(gltf.scene) as THREE.Group;
        frameGroup.add(model);
        yawGroup.add(frameGroup);
        scaleGroup.add(yawGroup);
        host.add(scaleGroup);
        host.updateMatrixWorld(true);
        {
            const probe = resolveRig(model, def.family);
            const l = probe.upperArmL ?? probe.thighL;
            const r = probe.upperArmR ?? probe.thighR;
            if (l && r) yawGroup.rotation.y = lateralYaw(l.getWorldPosition(new THREE.Vector3()), r.getWorldPosition(new THREE.Vector3()));
        }

        const scale = autoScaleToHeight(scaleGroup, TARGET_HEIGHT);
        host.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scaleGroup);
        // Feet on the floor — measured against where this fighter's origin is, not the world's: a host
        // that sits above or below y = 0 (the character-select preview lowers its group) must not push
        // the model up or down by that much.
        scaleGroup.position.y -= box.min.y - host.getWorldPosition(new THREE.Vector3()).y;
        host.updateMatrixWorld(true);

        // Skinned bounds can be a frustum-culling trap for posed models: cull by the animated pose instead.
        const emissiveMats: THREE.MeshStandardMaterial[] = [];
        model.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (!m.isMesh) return;
            m.frustumCulled = false;
            // Lit properly in the arena: cast and receive the key light's shadow.
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            const cloned = mats.map((x) => x.clone());
            m.material = Array.isArray(m.material) ? cloned : cloned[0];
            for (const mat of cloned) {
                const std = mat as THREE.MeshStandardMaterial;
                if (std.emissive) emissiveMats.push(std);
                sharpenTextures(std);
            }
        });

        const rig = resolveRig(model, def.family);
        const clips = buildSourceClips(rig, { height: TARGET_HEIGHT, worldScale: scale });
        // Boxer's fists and living fingers on top of the body clips (the hands are read from the bind pose, before any mixer).
        applyFists(clips, model, def.family);
        const mixer = new THREE.AnimationMixer(model);
        const actions: Partial<Record<ClipKey, THREE.AnimationAction>> = {};
        for (const key of CLIP_KEYS) {
            const clip = clips[key];
            if (clip) actions[key] = configure(mixer, clip, key);
        }
        const inst: Instance = {
            model, mixer, actions, emissiveMats,
            dispose: () => {
                mixer.stopAllAction();
                mixer.uncacheRoot(model);
                host.remove(scaleGroup);
                for (const m of emissiveMats) m.dispose();
            },
        };
        instance.current = inst;
        motion.reset();

        // The game's own run cycle for TF2 classes, when the sync published it.
        let cancelled = false;
        if (def.game === 'tf2' && def.tf2Class && rig.hips) {
            const hipsName = rig.hips.name;
            loadTf2NativeWalk(def.tf2Class).then((clip) => {
                if (cancelled || !clip) return;
                const old = inst.actions.walk;
                if (old && motion.currentClip() === 'walk') return; // don't swap mid-stride
                inst.actions.walk = configure(mixer, stripHipsXZ(clip, hipsName), 'walk');
            });
        }
        return () => {
            cancelled = true;
            inst.dispose();
            if (instance.current === inst) instance.current = null;
        };
    }, [gltf, def, motion]);

    useFrame((_, deltaRaw) => {
        const rf = framesRef.current.find((f) => f.seat === seat);
        const r = root.current;
        const inst = instance.current;
        if (!rf || !r || !inst) return;
        const host = modelHost.current;
        if (!host) return;

        // Smoothed position/facing, the clip driver and the impact reaction (useFighterMotion).
        const flash = motion.step({
            rf, root: r, host, mixer: inst.mixer, actions: inst.actions, want: resolveClip(rf).clip, deltaRaw, strafe: true,
        });
        for (const mat of inst.emissiveMats) {
            mat.emissive.setRGB(flash.color[0], flash.color[1], flash.color[2]).multiplyScalar(flash.amount);
        }
        if (shadow.current) shadow.current.scale.setScalar(rf.state === 'knockedOut' ? 1.4 : 1);
        if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = rf.alive ? 0.85 : 0.3;
    });

    return (
        <group ref={root}>
            <FighterTrappings showNameplate={showNameplate} plateColor={plateColor} plateLabel={`P${seat + 1}`} shadowRef={shadow} />
            {/* Source skins keep their own textures, so the seat's identity colour is a floor ring, not a tint. */}
            <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[0.5, 0.58, 32]} />
                <meshBasicMaterial color={initial?.color ?? '#ffffff'} transparent opacity={0.85} />
            </mesh>
            <group ref={modelHost} />
        </group>
    );
}
