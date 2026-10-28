import { BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { applyTint, PAINT_TINT_GLSL } from '@/components/tf2-hud/loadout/model-utils';

describe('paint tint shader patch', () => {
  it("has a line to hook into in three's map chunk (guards a three upgrade that renames it)", () => {
    expect(ShaderChunk.map_fragment).toContain('diffuseColor *= sampledDiffuseColor;');
    expect(ShaderChunk.map_fragment).toContain('sampledDiffuseColor');
  });

  it('can multiply the whole material instead of using the alpha as a mask (paintable items with no mask)', () => {
    expect(PAINT_TINT_GLSL).toContain('mix(1.0, sampledDiffuseColor.a, uPaintMasked)');
  });

  it("is the game's formula: tint multiplies or replaces by the factor, then blends by the mask alpha", () => {
    expect(PAINT_TINT_GLSL).toContain(
      'mix(sampledDiffuseColor.rgb * uPaint, uPaint, uPaintReplace)',
    );
    expect(PAINT_TINT_GLSL).toContain('mix(sampledDiffuseColor.rgb, paintTinted,');
  });
});

describe('applyTint', () => {
  const part = (userData: Record<string, unknown>) => {
    const material = new MeshStandardMaterial();
    material.userData = userData;
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), material));
    return { root, material };
  };
  const uniforms = (m: MeshStandardMaterial) =>
    m.userData.paintUniforms as {
      uPaint: { value: Color };
      uPaintReplace: { value: number };
      uPaintMasked: { value: number };
    };

  it("wears the material's own default tint when unpainted, and the paint when painted", () => {
    const { root, material } = part({ tint: true, tintDefault: [1, 0, 0], tintReplace: 0.5 });
    applyTint(root);
    expect(uniforms(material).uPaint.value.r).toBeCloseTo(1);
    expect(uniforms(material).uPaint.value.g).toBeCloseTo(0);
    expect(uniforms(material).uPaintReplace.value).toBe(0.5);
    expect(uniforms(material).uPaintMasked.value).toBe(1);
    applyTint(root, '#0000ff');
    expect(uniforms(material).uPaint.value.b).toBeCloseTo(1);
    expect(uniforms(material).uPaint.value.r).toBeCloseTo(0);
  });

  it('multiplies the whole material when there is no mask, and is white for a file without a default', () => {
    const whole = part({ tint: true, tintWhole: true, tintDefault: [0.5, 0.5, 0.5] });
    applyTint(whole.root);
    expect(uniforms(whole.material).uPaintMasked.value).toBe(0);
    const old = part({ tint: true });
    applyTint(old.root);
    expect(uniforms(old.material).uPaint.value.toArray()).toEqual([1, 1, 1]);
  });

  it('leaves an untinted material alone', () => {
    const { root, material } = part({});
    applyTint(root, '#ff0000');
    expect(material.userData.paintUniforms).toBeUndefined();
  });
});
