/** `SpAssets` for Harmonic: no files — surface properties and materials come from TypeScript. */
import type { SpAssets, SpMaterialInfo } from '../../sp-game/assets';
import { SurfacePropsTable } from '../../sp-game/physics/surface-props';
import { normalizeHarmonicMaterial } from '../compiler/materials';
import { HARMONIC_MATERIAL_LOOKUP, MATERIALS } from './materials';

/** surfaceproperties-format text for the props the materials use. */
export const HARMONIC_SURFACE_PROPS = `
"default" { "friction" "0.8" "elasticity" "0.25" "density" "2000" "gamematerial" "C" }
"concrete" { "base" "default" "friction" "0.8" "density" "2300" "gamematerial" "C" }
"metal" { "base" "default" "friction" "0.7" "elasticity" "0.2" "density" "2700" "gamematerial" "M" }
"wood" { "base" "default" "friction" "0.8" "elasticity" "0.3" "density" "700" "gamematerial" "W" }
"glass" { "base" "default" "friction" "0.5" "elasticity" "0.2" "density" "2500" "gamematerial" "Y" }
"ice" { "base" "default" "friction" "0.35" "elasticity" "0.1" "density" "917" "gamematerial" "I" }
"snow" { "base" "default" "friction" "0.9" "elasticity" "0.1" "density" "300" "maxspeedfactor" "0.95" "gamematerial" "N" }
`;

export function createHarmonicAssets(): SpAssets {
  const surfaceProps = new SurfacePropsTable();
  surfaceProps.addFile(HARMONIC_SURFACE_PROPS);
  return {
    game: 'hl2',
    surfaceProps,
    model: () => null,
    material(name: string): SpMaterialInfo {
      const key = normalizeHarmonicMaterial(name);
      const m = HARMONIC_MATERIAL_LOOKUP(key);
      return {
        surfaceProp: m.surfaceProp === 'default' ? '' : m.surfaceProp,
        noportal: false,
        nodraw: !!m.nodraw,
        sky: !!m.sky,
      };
    },
    scene: () => null,
    caption: () => null,
  };
}

/** Names of every material, for tooling. */
export const HARMONIC_MATERIAL_NAMES: string[] = Object.keys(MATERIALS);
