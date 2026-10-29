/**
 * Two small custom HUDs made from the TF2 Default base with the editor's own
 * lossless edits — the fixtures of the in-game fidelity test
 * (custom-hud.test.ts) and of the screenshot harness
 * (scripts/tf2-game/hud-harness). Each is a list of edits to base files, so
 * the same HUD is built from the files on disk (tests) or fetched (harness).
 *
 *  - `moved`: the player panels rearranged (health and ammo either side of the centre, ammo
 *    resized through hudlayout.res, the Über meter moved) and recoloured
 *    through the scheme — the edits authors make most.
 *  - `fonts`: a HUD that ships its own font file (registered through
 *    `CustomFontFiles`), sets the ammo in it, hides the class portrait and
 *    pins the reserve count to the clip with `pin_to_sibling`.
 */

import { kvSet } from '@/lib/tf2-hud/kv/edit';
import { parseKv } from '@/lib/tf2-hud/kv/parse';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';

export interface SampleEdit {
  path: string;
  /** `[blockPath…, key]` below the file's root block, and the value. */
  set: Array<[string[], string]>;
}

export interface SampleHud {
  id: 'moved' | 'fonts';
  name: string;
  edits: SampleEdit[];
  /** Binary files the HUD adds: published path → where the bytes come from (a public URL path). */
  binaries?: Record<string, string>;
}

export const SAMPLE_HUDS: readonly SampleHud[] = [
  {
    id: 'moved',
    name: 'Sample: moved & recoloured',
    edits: [
      {
        path: 'resource/ui/hudplayerhealth.res',
        set: [
          [['HudPlayerHealth', 'xpos'], 'c-290'],
          [['HudPlayerHealth', 'ypos'], 'r135'],
        ],
      },
      {
        path: 'scripts/hudlayout.res',
        set: [
          [['HudWeaponAmmo', 'xpos'], 'c170'],
          [['HudWeaponAmmo', 'ypos'], 'r95'],
          [['HudWeaponAmmo', 'wide'], '120'],
          [['HudMedicCharge', 'xpos'], 'c170'],
          [['HudMedicCharge', 'ypos'], 'r150'],
          [['HudDeathNotice', 'ypos'], '40'],
        ],
      },
      {
        path: 'resource/clientscheme.res',
        set: [
          [['Colors', 'TanLight'], '120 220 255 255'],
          [['Colors', 'HUDBlueTeamSolid'], '30 60 120 255'],
          [['Colors', 'HUDRedTeamSolid'], '150 30 40 255'],
        ],
      },
    ],
  },
  {
    id: 'fonts',
    name: 'Sample: custom font & pins',
    edits: [
      {
        path: 'resource/clientscheme.res',
        set: [
          [['Fonts', 'RmhSampleAmmo', '1', 'name'], 'TF2 Professor'],
          [['Fonts', 'RmhSampleAmmo', '1', 'tall'], '36'],
          [['Fonts', 'RmhSampleAmmo', '1', 'weight'], '400'],
          [['CustomFontFiles', '9', 'font'], 'resource/fonts/rmhsample.ttf'],
          [['CustomFontFiles', '9', 'name'], 'TF2 Professor'],
        ],
      },
      {
        path: 'resource/ui/hudammoweapons.res',
        set: [
          [['AmmoInClip', 'font'], 'RmhSampleAmmo'],
          [['AmmoInClip', 'fgcolor'], '255 200 60 255'],
          [['AmmoInReserve', 'pin_to_sibling'], 'AmmoInClip'],
          [['AmmoInReserve', 'pin_corner_to_sibling'], '0'],
          [['AmmoInReserve', 'pin_to_sibling_corner'], '1'],
          [['AmmoInReserve', 'xpos'], '2'],
          [['AmmoInReserve', 'ypos'], '6'],
        ],
      },
      {
        path: 'resource/ui/hudplayerclass.res',
        set: [
          [['PlayerStatusClassImage', 'visible'], '0'],
          [['PlayerStatusClassImageBG', 'xpos'], '0'],
        ],
      },
      {
        path: 'scripts/hudlayout.res',
        set: [
          [['HudWeaponAmmo', 'xpos'], 'r150'],
          [['HudWeaponAmmo', 'ypos'], 'r70'],
          [['HudWeaponAmmo', 'wide'], '140'],
          [['HudWeaponAmmo', 'tall'], '60'],
          [['HudChat', 'ypos'], '200'],
        ],
      },
    ],
    binaries: { 'resource/fonts/rmhsample.ttf': '/tf2-hud/fonts/tf2professor.ttf' },
  },
];

/** Apply a sample's edits to the base files `read` returns. Returns the changed text files. */
export function applySampleEdits(
  hud: SampleHud,
  read: (path: string) => string | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of hud.edits) {
    let text = out.get(e.path) ?? read(e.path);
    if (text === undefined) continue;
    const root = parseKv(text).roots.find((n) => n.children)?.key.text;
    if (!root) continue;
    for (const [path, value] of e.set) text = kvSet(text, [root, ...path], value, { env: PC_ENV });
    out.set(e.path, text);
  }
  return out;
}

export const sampleHud = (id: string): SampleHud | undefined =>
  SAMPLE_HUDS.find((h) => h.id === id);
