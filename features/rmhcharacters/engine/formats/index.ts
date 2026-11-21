/**
 * The one entry point for files: what can be exported, and how an uploaded
 * file is recognised and converted.
 *
 * Recognised on import (by shape, not by file name):
 *   - RMHCharacters JSON — one character or a roster bundle
 *   - Foundry VTT actor JSON — dnd5e or pf2e system
 *   - Pathbuilder 2e JSON
 *   - D&D Beyond character JSON
 */
import { loadDnd5e, loadPf2e } from '../data';
import { cloneCharacter, normalizeCharacter } from '../factory';
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import type { Character } from '../types';
import {
  exportFoundryDnd5e,
  exportFoundryPf2e,
  foundrySystemOf,
  importFoundryDnd5e,
  importFoundryPf2e,
  isFoundryActor,
} from './foundry';
import { exportPathbuilder, importPathbuilder, isPathbuilder } from './pathbuilder';
import { importDndBeyond, isDndBeyond } from './dndbeyond';
import { dnd5eMarkdown, pf2eMarkdown } from './markdown';
import { isObj, slug } from './util';

export const NATIVE_FORMAT = 'rmhcharacters';
export const NATIVE_VERSION = 1;

export type ExportFormat = 'native' | 'foundry' | 'pathbuilder' | 'markdown';

export interface ExportFile {
  filename: string;
  mime: string;
  body: string;
}

export const EXPORTS: Record<ExportFormat, { label: string; systems: Character['system'][] }> = {
  native: { label: 'RMHCharacters JSON', systems: ['dnd5e', 'pf2e'] },
  foundry: { label: 'Foundry VTT actor', systems: ['dnd5e', 'pf2e'] },
  pathbuilder: { label: 'Pathbuilder 2e JSON', systems: ['pf2e'] },
  markdown: { label: 'Markdown sheet', systems: ['dnd5e', 'pf2e'] },
};

const base = (c: Character) => slug(c.name || 'character') || 'character';

export async function exportCharacter(c: Character, format: ExportFormat): Promise<ExportFile> {
  const json = (v: unknown, suffix: string): ExportFile => ({
    filename: `${base(c)}${suffix}.json`,
    mime: 'application/json',
    body: JSON.stringify(v, null, 2),
  });
  if (format === 'native') return json({ format: NATIVE_FORMAT, version: NATIVE_VERSION, character: c }, '.rmhc');
  if (c.system === 'dnd5e') {
    const d = await loadDnd5e();
    if (format === 'foundry') return json(exportFoundryDnd5e(c, d), '.foundry-dnd5e');
    if (format === 'markdown') return { filename: `${base(c)}.md`, mime: 'text/markdown', body: dnd5eMarkdown(c, d) };
    throw new Error('Pathbuilder only reads Pathfinder characters.');
  }
  const d = await loadPf2e();
  if (format === 'foundry') return json(exportFoundryPf2e(c, d), '.foundry-pf2e');
  if (format === 'pathbuilder') return json(exportPathbuilder(c, d), '.pathbuilder');
  return { filename: `${base(c)}.md`, mime: 'text/markdown', body: pf2eMarkdown(c, d) };
}

export function rosterBundle(characters: Character[]): ExportFile {
  return {
    filename: 'rmhcharacters-roster.json',
    mime: 'application/json',
    body: JSON.stringify({ format: NATIVE_FORMAT, version: NATIVE_VERSION, characters }, null, 2),
  };
}

export interface ImportResult {
  characters: Character[];
  /** Which format the file was read as. */
  source: string;
}

/** Start at full HP when the file did not say. */
async function finish(c: Character): Promise<Character> {
  if (c.hp.current > 0) return c;
  if (c.system === 'dnd5e') return { ...c, hp: { ...c.hp, current: d5.maxHp(c, await loadDnd5e()) } };
  return { ...c, hp: { ...c.hp, current: p2.maxHp(c, await loadPf2e()) } };
}

export class ImportError extends Error {}

export async function importText(text: string): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError(
      'That file is not JSON. Import reads RMHCharacters, Foundry VTT, Pathbuilder 2e and D&D Beyond JSON.',
    );
  }
  const done = async (list: (Character | null)[], source: string): Promise<ImportResult> => {
    const characters = await Promise.all(list.filter((c): c is Character => Boolean(c)).map(finish));
    if (!characters.length) throw new ImportError('No character could be read from that file.');
    return { characters, source };
  };
  if (isObj(json) && json.format === NATIVE_FORMAT) {
    if (Array.isArray(json.characters))
      return done(json.characters.slice(0, 200).map(normalizeCharacter), 'RMHCharacters roster');
    return done([normalizeCharacter(json.character)], 'RMHCharacters');
  }
  if (isObj(json) && (json.system === 'dnd5e' || json.system === 'pf2e') && 'schemaVersion' in json)
    return done([normalizeCharacter(json)], 'RMHCharacters');
  if (isPathbuilder(json)) return done([importPathbuilder(json, await loadPf2e())], 'Pathbuilder 2e');
  if (isFoundryActor(json)) {
    return foundrySystemOf(json) === 'pf2e'
      ? done([importFoundryPf2e(json, await loadPf2e())], 'Foundry VTT (pf2e)')
      : done([importFoundryDnd5e(json, await loadDnd5e())], 'Foundry VTT (dnd5e)');
  }
  if (isDndBeyond(json)) return done([importDndBeyond(json, await loadDnd5e())], 'D&D Beyond');
  throw new ImportError('That JSON is not a character file this app recognises.');
}

/** Imported characters that collide with an existing id get a fresh one. */
export function dedupeIds(incoming: Character[], existing: Character[]): Character[] {
  const taken = new Set(existing.map((c) => c.id));
  return incoming.map((c) => (taken.has(c.id) ? cloneCharacter(c) : c));
}
