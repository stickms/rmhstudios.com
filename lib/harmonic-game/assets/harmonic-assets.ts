/** `SpAssets` for Harmonic: no files — surface properties and materials come from TypeScript. */
import type { SpAssets, SpMaterialInfo } from '../../sp-game/assets';
import { SurfacePropsTable } from '../../sp-game/physics/surface-props';
import { normalizeHarmonicMaterial } from '../compiler/materials';
import { HARMONIC_MATERIAL_LOOKUP, MATERIALS } from './materials';

/**
 * surfaceproperties-format text for the props the materials use. `stepleft`/`stepright`/`impact*`
 * name sounds of the audio bank (`audio/recipes.ts`), so the simulation's own footstep and impact
 * events already speak Harmonic's names.
 */
export const HARMONIC_SURFACE_PROPS = `
"default" { "friction" "0.8" "elasticity" "0.25" "density" "2000" "gamematerial" "C" "stepleft" "step.concrete" "stepright" "step.concrete" "bulletimpact" "impact.concrete" "impacthard" "impact.concrete" "impactsoft" "impact.concrete" }
"concrete" { "base" "default" "friction" "0.8" "density" "2300" "gamematerial" "C" "stepleft" "step.concrete" "stepright" "step.concrete" "bulletimpact" "impact.concrete" "impacthard" "impact.concrete" "impactsoft" "impact.concrete" }
"metal" { "base" "default" "friction" "0.7" "elasticity" "0.2" "density" "2700" "gamematerial" "M" "stepleft" "step.metal" "stepright" "step.metal" "bulletimpact" "impact.metal" "impacthard" "impact.metal" "impactsoft" "impact.metal" }
"grating" { "base" "default" "friction" "0.7" "elasticity" "0.2" "density" "1800" "gamematerial" "M" "stepleft" "step.grating" "stepright" "step.grating" "bulletimpact" "impact.grating" "impacthard" "impact.grating" "impactsoft" "impact.grating" }
"wood" { "base" "default" "friction" "0.8" "elasticity" "0.3" "density" "700" "gamematerial" "W" "stepleft" "step.wood" "stepright" "step.wood" "bulletimpact" "impact.wood" "impacthard" "impact.wood" "impactsoft" "impact.wood" }
"glass" { "base" "default" "friction" "0.5" "elasticity" "0.2" "density" "2500" "gamematerial" "Y" "stepleft" "step.ice" "stepright" "step.ice" "bulletimpact" "impact.glass" "impacthard" "impact.glass" "impactsoft" "impact.glass" }
"ice" { "base" "default" "friction" "0.35" "elasticity" "0.1" "density" "917" "gamematerial" "I" "stepleft" "step.ice" "stepright" "step.ice" "bulletimpact" "impact.ice" "impacthard" "impact.ice" "impactsoft" "impact.ice" }
"snow" { "base" "default" "friction" "0.9" "elasticity" "0.1" "density" "300" "maxspeedfactor" "0.95" "gamematerial" "N" "stepleft" "step.snow" "stepright" "step.snow" "bulletimpact" "impact.snow" "impacthard" "impact.snow" "impactsoft" "impact.snow" }
"water" { "base" "default" "friction" "0.4" "elasticity" "0.0" "density" "1000" "gamematerial" "W" "stepleft" "step.water" "stepright" "step.water" "bulletimpact" "impact.water" "impacthard" "impact.water" "impactsoft" "impact.water" }
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
