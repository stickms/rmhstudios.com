import { describe, expect, it } from 'vitest';
import { isSavePath, parseSnapshot, toSnapshot } from '@/lib/balatro/cloud-saves';
import { hasMpSidecar, mpPackPath, SAVE_DIR } from '@/lib/balatro/runtime';

/**
 * Multiplayer must never cost a player their single-player saves (PLAN §6.1,
 * data-loss criterion): the MP run snapshot and the mailbox live under /rmh,
 * outside the save directory, and are never backed up or restored as saves;
 * the `<profile>/mp.jkr` sidecar of a run continued from a match IS a save and
 * travels with the profile; and the MP pack can never overwrite a game file.
 */

describe('balatro multiplayer and saves', () => {
  it('never treats the MP mailbox or MP run snapshot as save files', () => {
    for (const path of ['/rmh/mp/run.jkr', 'rmh/mp/run.jkr', '/rmh/mp/state.json', 'mp/run.jkr', '/rmh/net/in', '../mp.jkr']) {
      expect(isSavePath(path), path).toBe(false);
    }
  });

  it('backs up the continued-run sidecar with its profile', () => {
    for (const path of ['1/mp.jkr', '2/mp.jkr', '3/mp.jkr']) expect(isSavePath(path), path).toBe(true);
    const files = [
      { path: '1/save.jkr', data: new Uint8Array([1]), mtime: 10 },
      { path: '1/mp.jkr', data: new Uint8Array([2]), mtime: 11 },
    ];
    expect(parseSnapshot(JSON.parse(JSON.stringify(toSnapshot(files))))).toEqual(files);
  });

  it('detects the sidecar in any profile, and nothing else', () => {
    const present = (paths: string[]) => (p: string) => paths.includes(p);
    expect(hasMpSidecar(present([`${SAVE_DIR}/2/mp.jkr`]))).toBe(true);
    expect(hasMpSidecar(present([`${SAVE_DIR}/1/save.jkr`, `${SAVE_DIR}/mp.jkr`, '/rmh/mp/run.jkr']))).toBe(false);
  });

  it('keeps MP pack files inside rmh_mp directories', () => {
    expect(mpPackPath('rmh_mp/init.lua')).toBe('/Balatro/rmh_mp/init.lua');
    for (const bad of ['main.lua', 'functions/state_events.lua', 'rmh_mp/../main.lua', '../home/web_user/love/Balatro/1/save.jkr', '/home/web_user/love/Balatro/rmh_mp/x']) {
      expect(mpPackPath(bad), bad).toBeNull();
    }
  });
});
