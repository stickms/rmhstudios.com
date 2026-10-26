import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKv, serializeKv } from '../kv/parse';
import { kvAt, kvValue } from '../kv/query';
import { kvAddBlock, kvRemove, kvSet } from '../kv/edit';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('KeyValues parser', () => {
  it('round-trips every base HUD file byte-for-byte', () => {
    const files = walk(BASE).filter((f) => /\.(res|txt)$/.test(f));
    expect(files.length).toBeGreaterThan(700);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(serializeKv(parseKv(text)), path.relative(BASE, f)).toBe(text);
    }
  });

  it('parses blocks, conditionals, BOM and CRLF', () => {
    const src = '﻿// c\r\n"Scheme"\r\n{\r\n\t"a"\t"1" [$X360]\r\n\tB { c d }\r\n}\r\n';
    const doc = parseKv(src);
    expect(serializeKv(doc)).toBe(src);
    expect(doc.diagnostics).toEqual([]);
    expect(kvAt(doc, ['scheme', 'b'])?.children?.[0].value?.text).toBe('d');
    expect(kvAt(doc, ['Scheme', 'a'])?.cond?.text).toBe('$X360');
  });

  it('never throws on malformed input and reports diagnostics', () => {
    for (const bad of ['"a" {', '}', '{ "x" "y" }', '"unterminated', '"k"', '"a" "b" } }']) {
      const doc = parseKv(bad);
      expect(serializeKv(doc)).toBe(bad);
      expect(doc.diagnostics.length).toBeGreaterThan(0);
    }
  });
});

describe('KeyValues edits', () => {
  const src = 'Panel\r\n{\r\n\t"xpos"\t\t"10"\r\n\t"ypos" 20\r\n}\r\n';

  it('sets existing values, keeping unquoted style and CRLF', () => {
    const out = kvSet(src, ['Panel', 'ypos'], '99');
    expect(out).toBe('Panel\r\n{\r\n\t"xpos"\t\t"10"\r\n\t"ypos" 99\r\n}\r\n');
  });

  it('adds missing keys and nested blocks with matching indentation', () => {
    const out = kvSet(src, ['Panel', 'wide'], '5');
    expect(kvValue(kvAt(parseKv(out), ['Panel'])!, 'wide')).toBe('5');
    expect(out).toContain('\r\n\t"wide"\t\t"5"');
    const nested = kvSet(src, ['Panel', 'Sub', 'k'], 'v');
    expect(kvAt(parseKv(nested), ['Panel', 'Sub', 'k'])?.value?.text).toBe('v');
    expect(parseKv(nested).diagnostics).toEqual([]);
  });

  it('removes entries and adds blocks', () => {
    expect(kvRemove(src, ['Panel', 'xpos'])).toBe('Panel\r\n{\r\n\t"ypos" 20\r\n}\r\n');
    const out = kvAddBlock(src, [], 'Other', { a: 'b' });
    expect(kvAt(parseKv(out), ['Other', 'a'])?.value?.text).toBe('b');
  });

  it('refuses to overwrite a block with a scalar', () => {
    expect(kvSet(src, ['Panel'], 'x')).toBe(src);
  });
});
