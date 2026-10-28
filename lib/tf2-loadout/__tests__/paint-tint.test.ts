import { ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT_TINT_GLSL } from '@/components/tf2-hud/loadout/model-utils';

describe('paint tint shader patch', () => {
  it("has a line to hook into in three's map chunk (guards a three upgrade that renames it)", () => {
    expect(ShaderChunk.map_fragment).toContain('diffuseColor *= sampledDiffuseColor;');
    expect(ShaderChunk.map_fragment).toContain('sampledDiffuseColor');
  });

  it("is the game's formula: tint multiplies or replaces by the factor, then blends by the mask alpha", () => {
    expect(PAINT_TINT_GLSL).toContain('mix(sampledDiffuseColor.rgb * uPaint, uPaint, uPaintReplace)');
    expect(PAINT_TINT_GLSL).toContain('mix(sampledDiffuseColor.rgb, paintTinted, sampledDiffuseColor.a)');
  });
});
