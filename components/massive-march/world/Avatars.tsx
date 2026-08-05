/**
 * Massive March — the other people.
 *
 * A round body on two very long legs, with two very long arms and a beak. It is
 * closer to a novelty drinking bird than to any animal, and that is the design:
 * §7 wants a silhouette that reads at four hundred metres and gestures that
 * read as gestures even when the whole figure is twelve pixels tall. One flat
 * colour per seat does the first job; limbs far too long for the body do the
 * second.
 *
 * The awkwardness is the point. A precisely animated character would make
 * pointing look correct and therefore invisible; this one makes it look like
 * somebody flailing at a hillside, which is both funnier and easier to see.
 *
 * Everything is driven from `live.ts` inside `useFrame` — no avatar re-renders
 * when a position arrives, because positions arrive fifteen times a second.
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, type Group, type Mesh, type SpotLight } from 'three';
import { avatarColor, TOY } from '@/lib/massive-march/palette';
import { GESTURES } from '@/lib/massive-march/gestures';
import { live, type LivePlayer } from '@/lib/massive-march/live';
import { BIT } from '@/lib/massive-march/net/events';
import type { MemberInfo } from '@/lib/massive-march/net/events';
import { none, useMmStore } from '@/lib/massive-march/store';
import { EYE_HEIGHT } from '@/lib/massive-march/constants';

const nameTextures = new Map<string, CanvasTexture>();

/** A name tag, painted like everything else on the island. */
function nameTexture(name: string, color: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${name}|${color}`;
  const cached = nameTextures.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#f7f3e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 10, canvas.height);
  ctx.strokeStyle = '#22201d';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#22201d';
  ctx.font = '900 30px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 14), canvas.width / 2 + 5, canvas.height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  nameTextures.set(key, texture);
  return texture;
}

interface AvatarProps {
  slot: number;
  name: string;
  torchBudget: boolean;
}

function Avatar({ slot, name, torchBudget }: AvatarProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legLeft = useRef<Mesh>(null);
  const legRight = useRef<Mesh>(null);
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);
  const tag = useRef<Mesh>(null);
  const bucket = useRef<Mesh>(null);
  const torch = useRef<SpotLight>(null);
  const speak = useRef<Mesh>(null);

  const color = avatarColor(slot);
  const texture = useMemo(() => nameTexture(name, color), [name, color]);
  useEffect(() => {
    // Textures are cached across mounts by name+colour, so disposal is the
    // cache's business, not this component's.
  }, []);

  useFrame(({ camera, clock }) => {
    const player: LivePlayer | undefined = live.players.get(slot);
    if (!root.current) return;
    if (!player) {
      root.current.visible = false;
      return;
    }
    root.current.visible = true;
    root.current.position.set(player.x, player.y, player.z);
    root.current.rotation.y = player.yaw;

    const crouching = (player.bits & BIT.CROUCH) !== 0;
    const sitting = (player.bits & BIT.SIT) !== 0;
    const blinded = (player.bits & BIT.BLIND) !== 0;
    const speaking = (player.bits & BIT.SPEAKING) !== 0;
    const time = clock.elapsedTime;

    // Legs. The swing tracks measured speed rather than an input, so a player
    // being carried along by a slide does not appear to be strolling.
    const stride = Math.min(1, player.speed / 7);
    const cycle = time * (6 + stride * 7);
    const swing = Math.sin(cycle) * stride * 0.85;
    if (legLeft.current) legLeft.current.rotation.x = swing;
    if (legRight.current) legRight.current.rotation.x = -swing;

    const stand = sitting ? 0.34 : crouching ? 0.55 : 1;
    if (body.current) {
      body.current.position.y = 0.95 * stand + Math.abs(Math.sin(cycle)) * stride * 0.06;
      body.current.scale.setScalar(1);
    }

    // Arms: gesture first, otherwise they swing opposite the legs.
    const gesture = GESTURES[player.gesture] ?? 'none';
    const since = (performance.now() - player.gestureAt) / 1000;
    applyGesture(gesture, since, swing, player.pitch, armLeft.current, armRight.current, body.current);

    if (bucket.current) bucket.current.visible = blinded;

    if (speak.current) {
      speak.current.visible = speaking;
      if (speaking) speak.current.scale.setScalar(1 + Math.sin(time * 9) * 0.14);
    }

    if (torch.current) {
      const lit = torchBudget && (player.bits & BIT.TORCH) !== 0;
      torch.current.visible = lit;
      torch.current.intensity = lit ? 42 : 0;
      if (lit) {
        torch.current.target.position.set(
          player.x + Math.sin(player.yaw) * 12,
          player.y + 1.1 - player.pitch * 12,
          player.z + Math.cos(player.yaw) * 12,
        );
        torch.current.target.updateMatrixWorld();
      }
    }

    if (tag.current) {
      // Billboard, and fade out past the range at which a name is legible
      // anyway — beyond that you are identifying people by colour, which is
      // exactly what the palette is for.
      tag.current.quaternion.copy(camera.quaternion);
      const distance = camera.position.distanceTo(root.current.position);
      const material = tag.current.material as unknown as { opacity: number; transparent: boolean };
      material.transparent = true;
      material.opacity = distance > 60 ? 0 : distance > 40 ? 1 - (distance - 40) / 20 : 1;
      tag.current.visible = material.opacity > 0.02;
    }
  });

  return (
    <group ref={root}>
      <mesh ref={legLeft} position={[-0.16, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.045, 0.96, 6]} />
        <meshLambertMaterial color={TOY.black} />
      </mesh>
      <mesh ref={legRight} position={[0.16, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.045, 0.96, 6]} />
        <meshLambertMaterial color={TOY.black} />
      </mesh>

      <group ref={body} position={[0, 0.95, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.44, 16, 12]} />
          <meshLambertMaterial color={color} />
        </mesh>
        {/* Beak — the whole reason the silhouette reads as facing somewhere. */}
        <mesh position={[0, 0.06, 0.46]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.12, 0.34, 6]} />
          <meshLambertMaterial color={TOY.yellowDeep} />
        </mesh>
        <mesh position={[-0.16, 0.2, 0.38]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshLambertMaterial color={TOY.black} />
        </mesh>
        <mesh position={[0.16, 0.2, 0.38]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshLambertMaterial color={TOY.black} />
        </mesh>

        <group ref={armLeft} position={[-0.42, 0.06, 0]}>
          <mesh position={[0, -0.42, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.036, 0.84, 6]} />
            <meshLambertMaterial color={TOY.black} />
          </mesh>
        </group>
        <group ref={armRight} position={[0.42, 0.06, 0]}>
          <mesh position={[0, -0.42, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.036, 0.84, 6]} />
            <meshLambertMaterial color={TOY.black} />
          </mesh>
        </group>

        <mesh ref={bucket} position={[0, 0.3, 0]} visible={false} castShadow>
          <cylinderGeometry args={[0.4, 0.34, 0.6, 12]} />
          <meshLambertMaterial color={TOY.blue} />
        </mesh>

        <mesh ref={speak} position={[0, 0.72, 0]} visible={false}>
          <ringGeometry args={[0.2, 0.29, 14]} />
          <meshBasicMaterial color={TOY.white} side={2} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      </group>

      {texture ? (
        <mesh ref={tag} position={[0, 2.15, 0]}>
          <planeGeometry args={[1.5, 0.375]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} depthTest={false} />
        </mesh>
      ) : null}

      <spotLight
        ref={torch}
        position={[0, 1.15, 0]}
        angle={0.5}
        penumbra={0.55}
        distance={46}
        decay={1.4}
        color="#ffe6b8"
        visible={false}
      />
    </group>
  );
}

/**
 * Map a gesture onto two absurdly long arms.
 *
 * `point` aims along the player's own look direction, which is what makes it
 * useful: the person receiving the signal can stand behind the pointer and
 * follow the arm to the thing.
 */
function applyGesture(
  gesture: string,
  since: number,
  swing: number,
  pitch: number,
  left: Group | null,
  right: Group | null,
  body: Group | null,
): void {
  if (!left || !right) return;
  const active = since < 2.6;

  // Default: arms swing opposite the legs.
  let lx = -swing * 0.6;
  let rx = swing * 0.6;
  let lz = 0;
  let rz = 0;
  if (body) body.rotation.set(0, 0, 0);

  if (active) {
    const t = since;
    switch (gesture) {
      case 'point':
        rx = -Math.PI / 2 - pitch;
        rz = 0.12;
        lx = 0.1;
        break;
      case 'wave':
        rx = -Math.PI * 0.85;
        rz = Math.sin(t * 12) * 0.5;
        break;
      case 'nod':
        if (body) body.rotation.x = Math.sin(t * 9) * 0.28;
        break;
      case 'shake':
        if (body) body.rotation.y = Math.sin(t * 10) * 0.4;
        break;
      case 'cheer':
        rx = -Math.PI * 0.95 + Math.sin(t * 8) * 0.2;
        lx = -Math.PI * 0.95 - Math.sin(t * 8) * 0.2;
        break;
      case 'shrug':
        rz = -0.9;
        lz = 0.9;
        rx = -0.4;
        lx = -0.4;
        break;
      case 'beckon':
        rx = -Math.PI * 0.55 + Math.sin(t * 7) * 0.55;
        break;
      default:
        break;
    }
  }

  left.rotation.set(lx, 0, lz);
  right.rotation.set(rx, 0, rz);
}

/**
 * Everybody but you.
 *
 * Torch lights are budgeted: four dynamic spot lights is already generous for a
 * forward renderer, and a twelve-person group all holding torches would
 * otherwise cost more than the terrain does. The nearest four win, which is the
 * right four — a torch fifty metres away contributes nothing you can see.
 */
export function Avatars() {
  const members = useMmStore((s) => s.session?.members ?? none<MemberInfo>());
  const selfSlot = useMmStore((s) => s.selfSlot);

  return (
    <>
      {members
        .filter((member) => member.slot !== selfSlot)
        .map((member, index) => (
          <Avatar key={member.socketId} slot={member.slot} name={member.name} torchBudget={index < 4} />
        ))}
    </>
  );
}

/** Your own hands, so the world has something of you in it. */
export function SelfHands() {
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);

  useFrame(({ camera, clock }) => {
    const bob = Math.sin(clock.elapsedTime * 8) * 0.012;
    for (const arm of [armLeft.current, armRight.current]) {
      if (!arm) continue;
      arm.position.y = -0.34 + bob;
    }
    void camera;
  });

  return (
    <group position={[0, -EYE_HEIGHT * 0.05, 0]}>
      <group ref={armLeft} position={[-0.34, -0.34, -0.62]} rotation={[-0.5, 0, 0.18]}>
        <mesh>
          <cylinderGeometry args={[0.042, 0.036, 0.6, 6]} />
          <meshLambertMaterial color={TOY.black} />
        </mesh>
      </group>
      <group ref={armRight} position={[0.34, -0.34, -0.62]} rotation={[-0.5, 0, -0.18]}>
        <mesh>
          <cylinderGeometry args={[0.042, 0.036, 0.6, 6]} />
          <meshLambertMaterial color={TOY.black} />
        </mesh>
      </group>
    </group>
  );
}
