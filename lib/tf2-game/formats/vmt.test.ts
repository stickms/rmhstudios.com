import { describe, expect, it } from 'vitest';
import {
  materialPath,
  parseVmt,
  summarizeVmt,
  texturePath,
  vmtFlag,
  vmtNumber,
  vmtVector,
} from './vmt';
import { gameFileSystem } from './tf2-root.test-support';
import { parseBsp, openPakfile } from './bsp';
import { readMap } from './tf2-root.test-support';

describe('vmt', () => {
  it('parses shader, lowercased params and proxies', () => {
    const m = parseVmt(`
      "VertexLitGeneric"
      {
        "$baseTexture" "models/props_farm/wooden_barrel"
        "$BumpMap" "models/props_farm/wooden_barrel_normal"
        "$translucent" 1
        "$alphatestreference" ".7"
        "$color2" "[1 0.5 0.25]"
        "$selfillumtint" "{255 0 0}"
        "%compilenodraw" "1"
        ">=dx90" { "$phong" "1" }
        "Proxies"
        {
          "AnimatedTexture" { "animatedtexturevar" "$basetexture" "animatedtextureframerate" 15 }
          "Sine" { "resultVar" "$alpha" }
        }
      }`);
    expect(m.shader).toBe('vertexlitgeneric');
    expect(m.params['$basetexture']).toBe('models/props_farm/wooden_barrel');
    expect(m.proxies.map((p) => p.name)).toEqual(['animatedtexture', 'sine']);
    expect(m.proxies[0].params.animatedtextureframerate).toBe('15');
    expect(m.blocks['>=dx90']).toEqual({ $phong: '1' });
    expect(vmtFlag(m, '$TRANSLUCENT')).toBe(true);
    expect(vmtFlag(m, '$additive')).toBe(false);
    expect(vmtNumber(m, '$alphatestreference')).toBeCloseTo(0.7);
    expect(vmtVector(m, '$color2')).toEqual([1, 0.5, 0.25]);
    expect(vmtVector(m, '$selfillumtint')).toEqual([1, 0, 0]);
    const s = summarizeVmt(m);
    expect(s.translucent && s.compileNoDraw).toBe(true);
    expect(s.bumpMap).toBe('models/props_farm/wooden_barrel_normal');
  });

  it('resolves patch includes with insert/replace', () => {
    const files: Record<string, string> = {
      'materials/base/rock.vmt': `"LightmappedGeneric" { "$basetexture" "nature/rock" "$surfaceprop" "Rock" "$envmaptint" "[1 1 1]" }`,
    };
    const m = parseVmt(
      `"patch" { "include" "materials\\Base\\Rock.vmt" "insert" { "$envmap" "env_cubemap" } "replace" { "$surfaceprop" "dirt" "$notthere" "x" } }`,
      (p) => files[p] ?? null,
    );
    expect(m.shader).toBe('lightmappedgeneric');
    expect(m.params.$basetexture).toBe('nature/rock');
    expect(m.params.$envmap).toBe('env_cubemap');
    expect(m.params.$surfaceprop).toBe('dirt');
    expect(m.params.$notthere).toBeUndefined();
    expect(m.includes).toEqual(['materials/base/rock.vmt']);
    // Without a resolver the patch is returned as is.
    expect(parseVmt(`"patch" { "include" "x" }`).shader).toBe('patch');
  });

  it('builds material and texture paths', () => {
    expect(materialPath('Maps\\ctf_2fort\\Foo')).toBe('materials/maps/ctf_2fort/foo.vmt');
    expect(texturePath('materials/foo/bar.vtf')).toBe('materials/foo/bar.vtf');
    expect(texturePath('foo/bar')).toBe('materials/foo/bar.vtf');
  });
});

describe.skipIf(!process.env.TF2_ROOT)('vmt (TF2_ROOT)', () => {
  it('parses the pakfile materials of ctf_2fort, resolving patches through the pak + game files', () => {
    const pak = openPakfile(parseBsp(readMap('ctf_2fort')));
    const fs = gameFileSystem();
    const resolve = (p: string) => {
      const b = pak.read(p) ?? fs.read(p);
      return b ? new TextDecoder('latin1').decode(b) : null;
    };
    const vmts = pak.list('materials', 'vmt');
    let withShader = 0;
    for (const p of vmts) {
      const m = parseVmt(resolve(p)!, resolve);
      if (m.shader && m.shader !== 'patch') withShader++;
    }
    // Patches whose base lives in the (absent) texture VPKs stay "patch"; most resolve.
    expect(withShader).toBeGreaterThan(vmts.length * 0.3);
  });
});
