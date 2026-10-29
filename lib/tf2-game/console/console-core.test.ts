/**
 * The console engine against Source's behaviour: the command splitter
 * (CCommandBuffer::GetNextCommandLength) and tokenizer (CCommand::Tokenize),
 * cvars (types, ranges, flags, archive), aliases (with the depth guard), the
 * buffer's `wait`, exec of stored cfgs, history and completion — with a
 * storage that throws.
 */
import { describe, expect, it } from 'vitest';
import { commonPrefix, ConsoleCore, MAX_ALIAS_DEPTH, MAX_COMMANDS_PER_FRAME } from './core';
import { ConVar, FCVAR_ARCHIVE, FCVAR_CHEAT, FCVAR_GAMEDLL, FCVAR_REPLICATED, flagNames } from './cvar';
import { ConsoleFiles, cfgName, type ConsoleStorage } from './files';
import { COMMAND_MAX_ARGC, COMMAND_MAX_LENGTH, splitCommands, tokenize, unquoteArgS } from './tokenize';

class MemoryStorage implements ConsoleStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const throwing: ConsoleStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

function core(storage: ConsoleStorage | null = new MemoryStorage()) {
  return new ConsoleCore({ files: new ConsoleFiles('tf2', storage) });
}

const texts = (c: ConsoleCore) => c.lines.map((l) => l.text);

describe('splitCommands (CCommandBuffer::GetNextCommandLength)', () => {
  it('splits on ; and newlines outside quotes', () => {
    expect(splitCommands('echo a; echo b\necho c')).toEqual(['echo a', ' echo b', 'echo c']);
    expect(splitCommands('alias x "echo a; echo b"; x')).toEqual(['alias x "echo a; echo b"', ' x']);
  });
  it('comments out the rest of the line with // (not inside quotes)', () => {
    expect(splitCommands('echo a // echo b; echo c\necho d')).toEqual(['echo a ', 'echo d']);
    expect(splitCommands('echo "http://x"; echo y')).toEqual(['echo "http://x"', ' echo y']);
  });
  it('ends a command at a newline even inside quotes (the engine legacy) and drops empties', () => {
    expect(splitCommands('echo "a\nb"')).toEqual(['echo "a', 'b"']);
    expect(splitCommands(';;  ; \n')).toEqual([]);
  });
});

describe('tokenize (CCommand::Tokenize)', () => {
  it('splits on whitespace, keeps quoted runs whole, makes break characters their own tokens', () => {
    expect(tokenize('bind w +forward')!.argv).toEqual(['bind', 'w', '+forward']);
    expect(tokenize('say "hello there"')!.argv).toEqual(['say', 'hello there']);
    // s_BreakSet "{}()':".
    expect(tokenize("echo don't")!.argv).toEqual(['echo', 'don', "'", 't']);
    expect(tokenize('connect 1.2.3.4:27015')!.argv).toEqual(['connect', '1.2.3.4', ':', '27015']);
    expect(tokenize('echo "" x')!.argv).toEqual(['echo', '', 'x']);
  });
  it('gives ArgS from the first argument on, quotes kept', () => {
    const t = tokenize('say  "hi there" all')!;
    expect(t.argS).toBe('"hi there" all');
    expect(unquoteArgS('"hi there"')).toBe('hi there');
    expect(tokenize('noclip')!.argS).toBe('');
  });
  it('does not expand $ and runs an unterminated quote to the end', () => {
    expect(tokenize('echo $HOME')!.argv).toEqual(['echo', '$HOME']);
    expect(tokenize('echo "abc def')!.argv).toEqual(['echo', 'abc def']);
  });
  it('refuses commands that overflow the buffer and clamps argv', () => {
    expect(tokenize(`echo ${'x'.repeat(COMMAND_MAX_LENGTH)}`)).toBeNull();
    const many = tokenize(`a ${'b '.repeat(100)}`)!;
    expect(many.argv.length).toBe(COMMAND_MAX_ARGC);
    expect(many.clamped).toBe(true);
  });
});

describe('cvars', () => {
  it('parse like atof, clamp to the range, truncate ints, normalise bools', () => {
    const i = new ConVar({ name: 'i', type: 'int', default: 3, min: 0, max: 10 });
    expect(i.set('7.9').ok).toBe(true);
    expect(i.string).toBe('7');
    i.set('99');
    expect(i.int).toBe(10);
    i.set('abc');
    expect(i.int).toBe(0);
    const b = new ConVar({ name: 'b', type: 'bool', default: false });
    b.set('5');
    expect(b.string).toBe('1');
    const f = new ConVar({ name: 'f', type: 'float', default: 0.5, min: 0, max: 1 });
    f.set('-2');
    expect(f.float).toBe(0);
    const s = new ConVar({ name: 's', type: 'string', default: 'a', values: ['a', 'b'], strict: true });
    expect(s.set('c').ok).toBe(false);
    expect(s.set('b').ok).toBe(true);
  });
  it('describe like the engine and name their flags', () => {
    const c = new ConVar({ name: 'sv_cheats', type: 'bool', default: 0, flags: FCVAR_GAMEDLL | FCVAR_REPLICATED, help: 'Allow cheats.' });
    expect(c.describe()[0]).toBe('"sv_cheats" = "0" ( def. "0" )');
    expect(flagNames(FCVAR_GAMEDLL | FCVAR_REPLICATED | FCVAR_CHEAT)).toBe('game replicated cheat');
  });
  it('fires onChange only on a change', () => {
    let n = 0;
    const c = new ConVar({ name: 'x', type: 'int', default: 1, onChange: () => n++ });
    c.set('1');
    c.set('2');
    c.set('2');
    c.set('3', true);
    expect(n).toBe(1);
  });
  it('set from the console: typed name prints, value sets, replicated and cheat ones refuse', () => {
    const c = core();
    c.registerCvar({ name: 'fps_test', type: 'int', default: 60, min: 0, max: 300, help: 'test' });
    c.registerCvar({ name: 'rep', type: 'int', default: 0, flags: FCVAR_REPLICATED });
    c.registerCvar({ name: 'cheaty', type: 'int', default: 0, flags: FCVAR_CHEAT });
    c.submit('fps_test');
    expect(texts(c)).toContain('"fps_test" = "60" ( def. "60" ) min. 0 max. 300');
    c.submit('fps_test 999');
    expect(c.cvar('fps_test')!.int).toBe(300);
    c.submit('rep 1');
    expect(c.cvar('rep')!.int).toBe(0);
    expect(texts(c).some((t) => t.includes("Can't change replicated ConVar rep"))).toBe(true);
    c.submit('cheaty 1');
    expect(c.cvar('cheaty')!.int).toBe(0);
    expect(texts(c).at(-1)).toBe("Can't use cheat cvar cheaty in multiplayer, unless the server has sv_cheats set to 1.");
    c.cheatsAllowed = () => true;
    c.submit('cheaty 1');
    expect(c.cvar('cheaty')!.int).toBe(1);
  });
  it('forwards server cvars instead of setting them', () => {
    const sent: Array<[string, string | null]> = [];
    const c = new ConsoleCore({ forwardServerCvar: (cv, v) => sent.push([cv.name, v]) });
    c.registerCvar({ name: 'sv_cheats', type: 'bool', default: 0, flags: FCVAR_GAMEDLL | FCVAR_REPLICATED });
    c.submit('sv_cheats 1; sv_cheats');
    expect(sent).toEqual([
      ['sv_cheats', '1'],
      ['sv_cheats', null],
    ]);
    expect(c.cvar('sv_cheats')!.bool).toBe(false);
    c.setReplicated('sv_cheats', '1');
    expect(c.cvar('sv_cheats')!.bool).toBe(true);
  });
});

describe('the command buffer', () => {
  it('runs ; separated commands in order and reports unknown ones', () => {
    const c = core();
    c.submit('echo one; echo two; nonsense_cmd');
    expect(texts(c)).toEqual(['] echo one; echo two; nonsense_cmd', 'one', 'two', 'Unknown command "nonsense_cmd"']);
  });
  it('wait delays the rest by frames', () => {
    const c = core();
    c.submit('echo a; wait; echo b; wait 2; echo c');
    expect(texts(c).slice(1)).toEqual(['a']);
    c.frame();
    expect(texts(c).slice(1)).toEqual(['a', 'b']);
    c.frame();
    expect(texts(c).slice(1)).toEqual(['a', 'b']);
    c.frame();
    expect(texts(c).slice(1)).toEqual(['a', 'b', 'c']);
    expect(c.pending).toBe(0);
  });
  it('expands aliases before what follows them, with +/- pairs', () => {
    const c = core();
    c.submit('alias +jumpshoot "echo jump; echo shoot"; alias -jumpshoot "echo land"; +jumpshoot; echo after; -jumpshoot');
    expect(texts(c).slice(1)).toEqual(['jump', 'shoot', 'after', 'land']);
  });
  it('stops a recursive alias at the depth limit instead of hanging', () => {
    const c = core();
    c.submit('alias loop "echo x; loop"; loop');
    const xs = texts(c).filter((t) => t === 'x').length;
    expect(xs).toBe(MAX_ALIAS_DEPTH);
    expect(texts(c).some((t) => t.includes('nests deeper than'))).toBe(true);
  });
  it('flushes an exploding alias at the per-frame command cap', () => {
    const c = core();
    c.submit('alias a "b;b"; alias b "a;a"; a');
    expect(texts(c).some((t) => t.includes('Command buffer overflow'))).toBe(true);
    expect(c.pending).toBe(0);
    expect(MAX_COMMANDS_PER_FRAME).toBeGreaterThan(1000);
  });
  it('allows a looping alias with a wait (each frame starts a fresh chain)', () => {
    const c = core();
    c.submit('alias tick "echo t; wait; tick"; tick');
    for (let i = 0; i < 60; i++) c.frame();
    expect(texts(c).filter((t) => t === 't').length).toBe(61);
    expect(texts(c).some((t) => t.includes('nests deeper'))).toBe(false);
  });
  it('refuses to alias a command or cvar, and lists aliases', () => {
    const c = core();
    c.submit('alias echo "clear"');
    expect(texts(c).at(-1)).toContain('Cannot alias an existing command');
    c.submit('alias gg "say gg"; alias');
    expect(texts(c)).toContain('gg : say gg');
  });
  it('toggle and incrementvar behave like the engine', () => {
    const c = core();
    c.registerCvar({ name: 'v', type: 'int', default: 0, min: 0, max: 10 });
    c.submit('toggle v');
    expect(c.cvar('v')!.int).toBe(1);
    c.submit('toggle v');
    expect(c.cvar('v')!.int).toBe(0);
    c.submit('toggle v 2 4 8; toggle v 2 4 8');
    expect(c.cvar('v')!.int).toBe(4);
    c.submit('incrementvar v 0 5 2');
    expect(c.cvar('v')!.int).toBe(0); // 6 > 5 wraps to the minimum
    c.submit('incrementvar v 0 5 -1');
    expect(c.cvar('v')!.int).toBe(5); // below the minimum wraps to the maximum
  });
  it('help, find and cvarlist describe what exists', () => {
    const c = core();
    c.registerCvar({ name: 'net_graph', type: 'int', default: 0, help: 'Draw the network graph.' });
    c.submit('help net_graph; find network; cvarlist net_');
    const t = texts(c);
    expect(t).toContain(' - Draw the network graph.');
    expect(t.some((l) => l.startsWith('net_graph') && l.includes('Draw the network graph.'))).toBe(true);
    expect(t.some((l) => /^1 total convars\/concommands$/.test(l))).toBe(true);
  });
});

describe('cfg files, history and storage', () => {
  it('execs stored cfgs (nested) and complains about missing ones', () => {
    const st = new MemoryStorage();
    const c = core(st);
    expect(c.files!.write('autoexec.cfg', 'echo hello\nexec more // comment\n')).toBe(true);
    c.files!.write('more.cfg', 'echo nested');
    c.submit('exec autoexec');
    expect(texts(c).slice(1)).toEqual(['hello', 'nested']);
    c.submit('exec missing');
    expect(texts(c).at(-1)).toBe("exec: couldn't exec missing");
  });
  it('stops a cfg that execs itself', () => {
    const c = core();
    c.files!.write('self.cfg', 'exec self');
    c.submit('exec self');
    expect(texts(c).some((t) => t.includes('nests too deep'))).toBe(true);
  });
  it('writes config.cfg with archived cvars (not settings-backed or server ones) and the extra lines', () => {
    const st = new MemoryStorage();
    const c = core(st);
    c.registerCvar({ name: 'net_graph', type: 'int', default: 0, flags: FCVAR_ARCHIVE });
    c.registerCvar({ name: 'sensitivity', type: 'float', default: 3, flags: FCVAR_ARCHIVE, settingsBacked: true });
    c.registerCvar({ name: 'sv_x', type: 'int', default: 0, flags: FCVAR_ARCHIVE | FCVAR_GAMEDLL });
    c.configExtras = () => ['bind "f" "say gg"'];
    c.submit('net_graph 2; host_writeconfig');
    const cfg = c.files!.read('config.cfg')!;
    expect(cfg).toContain('bind "f" "say gg"');
    expect(cfg).toContain('net_graph 2');
    expect(cfg).not.toContain('sensitivity');
    expect(cfg).not.toContain('sv_x');
    // A fresh console replays it.
    const c2 = core(st);
    c2.registerCvar({ name: 'net_graph', type: 'int', default: 0, flags: FCVAR_ARCHIVE });
    c2.registerCommand({ name: 'bind', run: () => {} });
    c2.exec('config.cfg');
    c2.execute();
    expect(c2.cvar('net_graph')!.int).toBe(2);
  });
  it('keeps history across consoles, deduplicated and capped', () => {
    const st = new MemoryStorage();
    const c = core(st);
    c.submit('echo 1');
    c.submit('echo 2');
    c.submit('echo 1');
    expect(c.history).toEqual(['echo 2', 'echo 1']);
    expect(core(st).history).toEqual(['echo 2', 'echo 1']);
  });
  it('works in memory when the storage throws or is missing', () => {
    for (const st of [throwing, null]) {
      const c = core(st);
      c.submit('echo works; host_writeconfig');
      expect(texts(c)).toContain('works');
      expect(texts(c).at(-1)).toContain("couldn't write config.cfg");
      expect(c.history).toEqual(['echo works; host_writeconfig']);
      expect(c.files!.read('config.cfg')).toBeNull();
      expect(c.files!.list()).toEqual([]);
    }
  });
  it('accepts only safe cfg names', () => {
    expect(cfgName('autoexec')).toBe('autoexec.cfg');
    expect(cfgName('cfg/Class/Soldier.cfg')).toBe('class/soldier.cfg');
    expect(cfgName('../evil')).toBeNull();
    expect(cfgName('a/b/c.cfg')).toBeNull();
    expect(cfgName('<x>')).toBeNull();
  });
});

describe('completion', () => {
  it('completes names, then argument values, on the last command of the line', () => {
    const c = core();
    c.registerCvar({ name: 'net_graph', type: 'int', default: 0, values: ['0', '1', '2', '3', '4'] });
    c.registerCvar({ name: 'net_graphpos', type: 'int', default: 0 });
    c.registerCommand({ name: 'changelevel', run: () => {}, complete: (i) => (i === 1 ? ['ctf_2fort', 'cp_dustbowl'] : []) });
    expect(c.complete('net_g').items).toEqual(['net_graph', 'net_graphpos']);
    expect(commonPrefix(c.complete('net_g').items)).toBe('net_graph');
    const r = c.complete('echo hi; changelevel ctf');
    expect(r.items).toEqual(['changelevel ctf_2fort']);
    expect('echo hi; changelevel ctf'.slice(0, r.start) + r.items[0]).toBe('echo hi; changelevel ctf_2fort');
    expect(c.complete('net_graph ').items).toEqual(['net_graph 0', 'net_graph 1', 'net_graph 2', 'net_graph 3', 'net_graph 4']);
  });
});
