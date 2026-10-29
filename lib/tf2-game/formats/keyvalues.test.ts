import { describe, expect, it } from 'vitest';
import {
  evaluateKvCondition,
  findEntities,
  findEntitiesByName,
  parseEntityLump,
  parseEntityOutput,
  parseKeyValues,
  parseKeyValuesBlock,
} from './keyvalues';

describe('parseKeyValues', () => {
  it('reads quoted and unquoted tokens, nested blocks and comments', () => {
    const { root } = parseKeyValues(`
      // a comment
      "Root"
      {
        key1 value1 // trailing comment
        "key 2" "value with spaces"
        Nested{inner "1"}
        "url" "http://example.com/a//b"
        bare http://x.y/z
      }
    `);
    const r = root.get('root')!;
    expect(r.isBlock).toBe(true);
    expect(r.getString('KEY1')).toBe('value1');
    expect(r.getString('key 2')).toBe('value with spaces');
    expect(r.get('nested')!.getNumber('inner')).toBe(1);
    expect(r.getString('url')).toBe('http://example.com/a//b');
    // Unquoted tokens run to whitespace, so "//" inside one is not a comment.
    expect(r.getString('bare')).toBe('http://x.y/z');
  });

  it('preserves duplicate keys in order and looks them up case-insensitively', () => {
    const block = parseKeyValuesBlock(
      `"x" { "OnTrigger" "a" "ontrigger" "b" "Other" "c" "ONTRIGGER" "d" }`,
    )!;
    expect(block.getAll('onTrigger').map((n) => n.value)).toEqual(['a', 'b', 'd']);
    expect(block.get('ONTRIGGER')!.value).toBe('a');
  });

  it('surfaces #base / #include directives', () => {
    const { directives, root } = parseKeyValues(
      `#base "base.res"\n#include "inc.txt"\n"a" { "b" "c" }`,
    );
    expect(directives).toEqual([
      { type: 'base', path: 'base.res' },
      { type: 'include', path: 'inc.txt' },
    ]);
    expect(root.get('a')!.getString('b')).toBe('c');
  });

  it('evaluates conditionals for a PC build, or keeps them all', () => {
    const text = `"s" { "k" "pc" [$WIN32] "k" "console" [$X360] "j" "notx" [!$X360] "blk" [$X360] { "a" "1" } }`;
    const pc = parseKeyValuesBlock(text)!;
    expect(pc.getAll('k').map((n) => n.value)).toEqual(['pc']);
    expect(pc.getString('j')).toBe('notx');
    expect(pc.get('blk')).toBeUndefined();
    const all = parseKeyValuesBlock(text, { evaluate: null })!;
    expect(all.getAll('k').map((n) => n.condition)).toEqual(['$WIN32', '$X360']);
    expect(all.get('blk')!.condition).toBe('$X360');
    expect(evaluateKvCondition('$X360||$WIN32', (n) => n === 'WIN32')).toBe(true);
    expect(evaluateKvCondition('!$WIN32&&$POSIX', (n) => n === 'WIN32')).toBe(false);
  });

  it('handles escapes only when asked, and tolerates malformed input', () => {
    expect(parseKeyValuesBlock(`"a" { "p" "c:\\new\\tab" }`)!.getString('p')).toBe('c:\\new\\tab');
    expect(
      parseKeyValuesBlock(`"a" { "p" "say \\"hi\\"\\n" }`, { escapes: true })!.getString('p'),
    ).toBe('say "hi"\n');
    // Missing closing brace and a dangling key.
    const r = parseKeyValues(`"a" { "b" "c" "d"`).root;
    expect(r.get('a')!.getString('b')).toBe('c');
    expect(r.get('a')!.getString('d')).toBe('');
    expect(parseKeyValues('}}} "x" "y"').root.getString('x')).toBe('y');
  });

  it('walks paths and converts to objects', () => {
    const r = parseKeyValuesBlock(
      `"g" { "FileSystem" { "SearchPaths" { "game" "tf" "game" "hl2" } } }`,
    )!;
    expect(
      r
        .find('filesystem/searchpaths')!
        .getAll('game')
        .map((n) => n.value),
    ).toEqual(['tf', 'hl2']);
    expect(r.toObject()).toEqual({ FileSystem: { SearchPaths: { game: 'hl2' } } });
  });
});

describe('parseEntityLump', () => {
  const lump = `{
"world_maxs" "1 2 3"
"classname" "worldspawn"
}
{
"origin" "-10 20.5 30"
"angles" "0 90 0"
"targetname" "spawn_red_1"
"classname" "info_player_teamspawn"
"TeamNum" "2"
}
{
"model" "*3"
"classname" "trigger_multiple"
"OnStartTouch" "door,Open,,0,-1"
"OnStartTouch" "relay\x1bTrigger\x1b\x1b1.5\x1b1"
}
{
"angle" "-1"
"classname" "info_target"
}
\0`;

  it('reads every block with duplicate outputs in order', () => {
    const ents = parseEntityLump(lump);
    expect(ents.map((e) => e.classname)).toEqual([
      'worldspawn',
      'info_player_teamspawn',
      'trigger_multiple',
      'info_target',
    ]);
    const spawn = findEntities(ents, 'INFO_PLAYER_TEAMSPAWN')[0];
    expect(spawn.origin).toEqual({ x: -10, y: 20.5, z: 30 });
    expect(spawn.angles).toEqual({ x: 0, y: 90, z: 0 });
    expect(spawn.getNumber('teamnum')).toBe(2);
    const trig = ents[2];
    expect(trig.brushModelIndex).toBe(3);
    const outs = trig.getAll('onstarttouch').map(parseEntityOutput);
    expect(outs[0]).toEqual({
      target: 'door',
      input: 'Open',
      parameter: '',
      delay: 0,
      timesToFire: -1,
    });
    expect(outs[1]).toEqual({
      target: 'relay',
      input: 'Trigger',
      parameter: '',
      delay: 1.5,
      timesToFire: 1,
    });
    // "angle" -1 is ANGLE_UP.
    expect(ents[3].angles).toEqual({ x: -90, y: 0, z: 0 });
    expect(findEntitiesByName(ents, 'spawn_red*')).toHaveLength(1);
  });

  it('keeps values with special characters', () => {
    const ents = parseEntityLump(`{ "classname" "logic_auto" "message" "a { b } // c" }`);
    expect(ents[0].get('message')).toBe('a { b } // c');
  });
});
