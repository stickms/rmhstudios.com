"use client";
import { PALETTE, matteMaterialProps } from "./palette";

interface BuildingProps {
  variant: "house" | "shop";
  size: [number, number, number];
}

// ─── House (lab) ─────────────────────────────────────────────────────────────
// Siding walls, pitched roof, door, two front windows, eave trim.
// Base at y=0; fills size [w, h, d].

function HouseBuilding({ w, h, d }: { w: number; h: number; d: number }) {
  const wallH = h * 0.65;
  const roofH = h - wallH;
  const halfW = w / 2;
  // Slope geometry
  const slantLen = Math.sqrt(halfW * halfW + roofH * roofH);
  const roofAngle = Math.atan2(roofH, halfW);
  const roofOvhZ = 0.25; // overhang past each depth end

  // Front-face element helpers
  const frontZ = d / 2 + 0.06;
  const doorW = w * 0.13;
  const doorH = wallH * 0.58;
  const winW = w * 0.15;
  const winH = 0.65;

  return (
    <group>
      {/* ── Walls ── */}
      <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, d]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>

      {/* ── Eave trim band ── */}
      <mesh position={[0, wallH + 0.06, 0]} castShadow>
        <boxGeometry args={[w + 0.08, 0.12, d + 0.08]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* ── Pitched roof — left panel ── */}
      <mesh
        position={[-halfW / 2, wallH + roofH / 2, 0]}
        rotation={[0, 0, roofAngle]}
        castShadow
      >
        <boxGeometry args={[slantLen + 0.18, 0.18, d + roofOvhZ * 2]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.roof)} />
      </mesh>

      {/* ── Pitched roof — right panel ── */}
      <mesh
        position={[halfW / 2, wallH + roofH / 2, 0]}
        rotation={[0, 0, -roofAngle]}
        castShadow
      >
        <boxGeometry args={[slantLen + 0.18, 0.18, d + roofOvhZ * 2]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.roof)} />
      </mesh>

      {/* ── Ridge cap ── */}
      <mesh position={[0, wallH + roofH, 0]} castShadow>
        <boxGeometry args={[0.28, 0.16, d + roofOvhZ * 2 + 0.1]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.roof)} />
      </mesh>

      {/* ── Door (front center) ── */}
      <mesh position={[0, doorH / 2, frontZ]} castShadow>
        <boxGeometry args={[doorW, doorH, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* ── Window left ── */}
      <mesh position={[-w * 0.29, wallH * 0.58, frontZ]} castShadow>
        <boxGeometry args={[winW, winH, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* ── Window right ── */}
      <mesh position={[w * 0.29, wallH * 0.58, frontZ]} castShadow>
        <boxGeometry args={[winW, winH, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>
    </group>
  );
}

// ─── Shop (supplier) ─────────────────────────────────────────────────────────
// Stucco walls, flat parapet roof, wide storefront window,
// sign band above window, corner pilasters, door offset to side.
// Base at y=0; fills size [w, h, d].

function ShopBuilding({ w, h, d }: { w: number; h: number; d: number }) {
  const wallH = h * 0.82;
  const parapetH = h * 0.18;
  const frontZ = d / 2 + 0.07;

  const signH = wallH * 0.2;
  const signY = wallH - signH / 2;

  const storeWinW = w * 0.52;
  const storeWinH = wallH * 0.38;
  const storeWinY = storeWinH / 2 + 0.05;

  const doorW = 0.65;
  const doorH = wallH * 0.55;

  return (
    <group>
      {/* ── Stucco walls ── */}
      <mesh position={[0, wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, d]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.stucco)} />
      </mesh>

      {/* ── Parapet ── */}
      <mesh position={[0, wallH + parapetH / 2, 0]} castShadow>
        <boxGeometry args={[w + 0.1, parapetH, d + 0.1]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>

      {/* ── Flat roof slab ── */}
      <mesh position={[0, wallH, 0]} receiveShadow>
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingB)} />
      </mesh>

      {/* ── Sign band (front face, warm wood) ── */}
      <mesh position={[0, signY, frontZ]} castShadow>
        <boxGeometry args={[w + 0.04, signH, 0.14]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* ── Storefront window (front, centered) ── */}
      <mesh position={[-w * 0.12, storeWinY, frontZ]} castShadow>
        <boxGeometry args={[storeWinW, storeWinH, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.metal)} />
      </mesh>

      {/* ── Door (front, offset right) ── */}
      <mesh position={[w * 0.33, doorH / 2, frontZ]} castShadow>
        <boxGeometry args={[doorW, doorH, 0.12]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wood)} />
      </mesh>

      {/* ── Corner pilasters (front) ── */}
      <mesh position={[-(w / 2 + 0.06), wallH / 2, frontZ]} castShadow>
        <boxGeometry args={[0.12, wallH, 0.14]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>
      <mesh position={[w / 2 + 0.06, wallH / 2, frontZ]} castShadow>
        <boxGeometry args={[0.12, wallH, 0.14]} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.sidingA)} />
      </mesh>
    </group>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function Building({ variant, size }: BuildingProps) {
  const [w, h, d] = size;
  return variant === "house" ? (
    <HouseBuilding w={w} h={h} d={d} />
  ) : (
    <ShopBuilding w={w} h={h} d={d} />
  );
}
