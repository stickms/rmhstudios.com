/**
 * A person wearing a skin: the skinned model when the manifest has one for it and it has loaded, the procedural figure
 * otherwise. The fallback is automatic and total: no manifest, an unknown skin, a failed download, a model that will
 * not render, a device that should not run skinned models, a lost GL context, or a crowd past the model budget all
 * show the procedural figure, and nothing here ever blocks rendering or throws.
 *
 * The owner keeps doing what it did for the procedural figure (it may pass `refs` to swing the limbs itself) and also
 * fills in `drive`, the plain object the model's animator reads. Placing the figure (position, yaw) is the owner's job.
 */

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { locomotionBlend } from '@features/hearthworks/engine/avatar';
import { SKIN_LOOKS, type SkinId, type SkinLook } from '@features/hearthworks/engine/skins';
import type { FigureDrive } from '@features/hearthworks/engine/skins/animator';
import type { FigureHandle } from '@features/hearthworks/engine/skins/figure-registry';
import { markModelBad } from '@features/hearthworks/engine/skins/model-loader';
import { Figure, type FigureRefs } from './Figure';
import { useFigureRegistry } from './figure-system';
import { HELD_FALLBACK, ModelFigure } from './ModelFigure';
import { useSkinModel } from './useSkinModel';

export interface SkinFigureProps {
  skin: SkinId;
  drive: FigureDrive;
  /** Limb groups the owner swings itself while the procedural figure is showing. Omit to get a simple gait for free. */
  refs?: FigureRefs;
  /** Carried in the right hand (a gun). On the model it rides the hand bone; on the stand-in it hangs at the hip. */
  held?: ReactNode;
  /** Always a full-rate model, never demoted: the player's own avatar, the wardrobe preview. */
  pinned?: boolean;
}

/** Catches anything a model throws while rendering so one bad GLB degrades to the stand-in instead of the scene. */
class ModelBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ProceduralFigure({
  look,
  refs,
  drive,
  held,
}: {
  look: SkinLook;
  refs?: FigureRefs;
  drive: FigureDrive;
  held?: ReactNode;
}) {
  const tilt = useRef<THREE.Group>(null);
  const own: FigureRefs = {
    body: useRef<THREE.Group>(null),
    legL: useRef<THREE.Group>(null),
    legR: useRef<THREE.Group>(null),
    armL: useRef<THREE.Group>(null),
    armR: useRef<THREE.Group>(null),
  };
  const phase = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const g = tilt.current;
    if (g) {
      // Downed: topple over rather than stand there.
      const target = drive.dead ? -Math.PI / 2 : 0;
      g.rotation.x += (target - g.rotation.x) * (1 - Math.exp(-6 * dt));
    }
    if (refs) return; // the owner swings the limbs
    phase.current += drive.speed * dt * 6.2;
    const b = locomotionBlend(drive.speed);
    const swing = Math.sin(phase.current) * (b.walk * 0.62 + b.run);
    if (own.legL?.current) own.legL.current.rotation.x = swing;
    if (own.legR?.current) own.legR.current.rotation.x = -swing;
    if (own.armL?.current) own.armL.current.rotation.x = -swing * 0.9;
    if (own.armR?.current) own.armR.current.rotation.x = swing * 0.9;
  });

  return (
    <group ref={tilt}>
      <Figure look={look} refs={refs ?? own} />
      {held && <group position={HELD_FALLBACK}>{held}</group>}
    </group>
  );
}

export function SkinFigure({ skin, drive, refs, held, pinned = false }: SkinFigureProps) {
  const look = SKIN_LOOKS[skin];
  const registry = useFigureRegistry();
  const group = useRef<THREE.Group>(null);
  const [handle, setHandle] = useState<FigureHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!registry) return;
    const h = registry.register({ pinned, drive });
    h.object = group.current;
    setHandle(h);
    return () => {
      registry.unregister(h.id);
      setHandle(null);
    };
  }, [registry, pinned, drive]);

  // Whether the budget currently gives this person a model. With no registry (a lone preview) it always does.
  const subscribe = useCallback(
    (cb: () => void) => (registry && handle ? registry.subscribe(handle.id, cb) : () => undefined),
    [registry, handle],
  );
  const wants = useSyncExternalStore(
    subscribe,
    () => (registry ? !!handle && registry.wantsModel(handle.id) : true),
    () => false,
  );

  const { status, model } = useSkinModel(skin, wants, pinned);
  const showModel = wants && status === 'ready' && model !== null && (!registry || handle !== null);
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => {
    markModelBad(skin);
    setReady(false);
    bump((n) => n + 1);
  }, [skin]);

  useEffect(() => {
    if (!showModel) setReady(false);
  }, [showModel, skin]);

  return (
    <group ref={group}>
      {!(showModel && ready) && <ProceduralFigure look={look} refs={refs} drive={drive} held={held} />}
      {showModel && model && (
        <ModelBoundary key={skin} onError={onError}>
          <ModelFigure model={model} look={look} drive={drive} handle={registry ? handle : null} held={held} onReady={onReady} />
        </ModelBoundary>
      )}
    </group>
  );
}
