/**
 * The developer console's engine: the cvar and command registry (ICvar),
 * the command buffer (CCommandBuffer: commands run in order, `wait [n]`
 * delays the rest by n frames, an alias's commands run before whatever
 * follows it), aliases, `exec` of the player's cfg files, the scrollback,
 * the command history and tab completion. It knows nothing about any game:
 * `GameConsole` (./game-console.ts) registers the games' cvars and commands
 * on top of it.
 *
 * Safety the engine leaves to its buffer size is explicit here: an alias may
 * expand at most MAX_ALIAS_DEPTH deep without a `wait` between (`alias a a`
 * stops with an error instead of hanging), and at most
 * MAX_COMMANDS_PER_FRAME commands run in one frame (the buffer is flushed
 * past that, like the engine's "Cbuf_AddText: buffer overflow").
 *
 * Environment-agnostic.
 */

import {
  ConVar,
  FCVAR_ARCHIVE,
  FCVAR_CHEAT,
  FCVAR_GAMEDLL,
  FCVAR_HIDDEN,
  FCVAR_REPLICATED,
  atof,
  flagNames,
  formatNumber,
  type CvarDef,
} from './cvar';
import { cfgName, HISTORY_MAX, type ConsoleFiles } from './files';
import { COMMAND_MAX_LENGTH, lastCommandStart, quoteArg, splitCommands, tokenize } from './tokenize';

/** How deep aliases (and cfgs exec'ing cfgs) may nest within one frame. */
export const MAX_ALIAS_DEPTH = 32;
/** Commands run per frame before the buffer is flushed. */
export const MAX_COMMANDS_PER_FRAME = 4096;
/** cmd.cpp MAX_ALIAS_NAME. */
export const MAX_ALIAS_NAME = 32;
export const MAX_ALIASES = 512;
/** Frames one `wait` may delay. */
export const MAX_WAIT_FRAMES = 6000;
/** Lines of scrollback kept. */
export const DEFAULT_MAX_LINES = 2000;

export type ConsoleLevel = 'info' | 'echo' | 'warn' | 'error' | 'dev' | 'success';

export interface ConsoleLine {
  id: number;
  text: string;
  level: ConsoleLevel;
}

/** Who issued a command: typed, a key binding, a cfg file, an alias's expansion. */
export type CommandSource = 'user' | 'bind' | 'cfg' | 'alias';

export interface CommandContext {
  argv: readonly string[];
  /** The raw argument text (CCommand::ArgS). */
  argS: string;
  source: CommandSource;
  con: ConsoleCore;
  /** Alias / exec nesting this command runs at (an exec inside passes it on). */
  depth: number;
}

export interface CommandDef {
  name: string;
  help?: string;
  flags?: number;
  run(ctx: CommandContext): void;
  /** Completion values for argv[index] (index ≥ 1), given the words before it. */
  complete?(index: number, argv: readonly string[]): readonly string[];
  /**
   * The command runs on the server, which checks FCVAR_CHEAT itself: the client does not pre-check
   * it against its replicated sv_cheats (so `sv_cheats 1; noclip` on one line works — the server
   * applies them in order).
   */
  serverSide?: boolean;
}

export interface ConsoleCoreOptions {
  files?: ConsoleFiles | null;
  maxLines?: number;
  /** Whether cheat cvars and commands may run here (the server's replicated sv_cheats). */
  cheatsAllowed?: () => boolean;
  /** A server cvar typed on the client: send it to the server (value null = print it there). */
  forwardServerCvar?: (cvar: ConVar, value: string | null) => void;
  /** An archived, config-persisted cvar changed (the game rewrites config.cfg). */
  onArchiveChange?: (cvar: ConVar) => void;
}

interface Queued {
  text: string;
  tick: number;
  depth: number;
  source: CommandSource;
}

export interface Completion {
  /** Where in the line the items replace the text. */
  start: number;
  items: string[];
}

/** The longest common prefix (case-insensitive) of the items. */
export function commonPrefix(items: readonly string[]): string {
  if (!items.length) return '';
  let p = items[0];
  for (const s of items) {
    let i = 0;
    while (i < p.length && i < s.length && p[i].toLowerCase() === s[i].toLowerCase()) i++;
    p = p.slice(0, i);
  }
  return p;
}

/** Words of a partly typed command, quotes respected (for completion). */
function roughWords(seg: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let has = false;
  for (const c of seg) {
    if (c === '"') {
      quoted = !quoted;
      has = true;
      continue;
    }
    if (!quoted && /\s/.test(c)) {
      if (has) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

export class ConsoleCore {
  private readonly cvars = new Map<string, ConVar>();
  private readonly commands = new Map<string, CommandDef>();
  private readonly aliases = new Map<string, string>();
  private queue: Queued[] = [];
  private curTick = 0;
  private executing = false;
  private readonly listeners = new Set<() => void>();
  private readonly out: ConsoleLine[] = [];
  private nextLineId = 1;
  private readonly maxLines: number;
  private hist: string[];
  /** Bumps on every scrollback change (useSyncExternalStore). */
  version = 0;
  readonly files: ConsoleFiles | null;
  cheatsAllowed: () => boolean;
  forwardServerCvar: ConsoleCoreOptions['forwardServerCvar'];
  onArchiveChange: ConsoleCoreOptions['onArchiveChange'];
  /** Extra config.cfg lines (the game's binds). */
  configExtras: () => string[] = () => [];
  readonly developer: ConVar;

  constructor(opts: ConsoleCoreOptions = {}) {
    this.files = opts.files ?? null;
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.cheatsAllowed = opts.cheatsAllowed ?? (() => false);
    this.forwardServerCvar = opts.forwardServerCvar;
    this.onArchiveChange = opts.onArchiveChange;
    this.hist = this.files?.loadHistory() ?? [];
    this.developer = this.registerCvar({
      name: 'developer',
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      help: 'Show developer messages (1), and more of them (2).',
    });
    this.registerBuiltins();
  }

  // ─── Registry ────────────────────────────────────────────────────────────

  registerCvar(def: CvarDef): ConVar {
    const key = def.name.toLowerCase();
    if (this.cvars.has(key) || this.commands.has(key)) throw new Error(`console: "${def.name}" is already registered`);
    const cv = new ConVar(def);
    this.cvars.set(key, cv);
    return cv;
  }

  registerCommand(def: CommandDef): void {
    const key = def.name.toLowerCase();
    if (this.cvars.has(key) || this.commands.has(key)) throw new Error(`console: "${def.name}" is already registered`);
    this.commands.set(key, def);
  }

  cvar(name: string): ConVar | null {
    return this.cvars.get(name.toLowerCase()) ?? null;
  }

  command(name: string): CommandDef | null {
    return this.commands.get(name.toLowerCase()) ?? null;
  }

  alias(name: string): string | null {
    return this.aliases.get(name.toLowerCase()) ?? null;
  }

  allCvars(): ConVar[] {
    return [...this.cvars.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  allCommands(): CommandDef[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  allAliases(): Array<[string, string]> {
    return [...this.aliases.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  // ─── Output ──────────────────────────────────────────────────────────────

  get lines(): readonly ConsoleLine[] {
    return this.out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Prints text (each line its own entry); developer lines only while `developer` is on. */
  print(text: string, level: ConsoleLevel = 'info'): void {
    if (level === 'dev' && this.developer.int <= 0) return;
    for (const line of String(text).split('\n')) {
      this.out.push({ id: this.nextLineId++, text: line.slice(0, 1024), level });
    }
    // Trim in batches so a busy console does not shift the array on every line.
    if (this.out.length > this.maxLines + 100) this.out.splice(0, this.out.length - this.maxLines);
    this.changed();
  }

  clear(): void {
    this.out.length = 0;
    this.changed();
  }

  // ─── History ─────────────────────────────────────────────────────────────

  get history(): readonly string[] {
    return this.hist;
  }

  addHistory(line: string): void {
    const s = line.trim();
    if (!s || s.length > COMMAND_MAX_LENGTH - 2) return;
    const i = this.hist.indexOf(s);
    if (i >= 0) this.hist.splice(i, 1);
    this.hist.push(s);
    if (this.hist.length > HISTORY_MAX) this.hist.splice(0, this.hist.length - HISTORY_MAX);
    this.files?.saveHistory(this.hist);
  }

  // ─── The command buffer ──────────────────────────────────────────────────

  /** What the player typed: echoed, remembered, run now. */
  submit(line: string): void {
    const text = line.slice(0, 4096);
    this.print(`] ${text}`, 'echo');
    this.addHistory(text);
    this.addText(text, 'user');
    this.execute();
  }

  /** Runs text now (binds, the UI's buttons, cfgs at start) — then everything due this frame. */
  run(text: string, source: CommandSource = 'bind'): void {
    this.addText(text, source);
    this.execute();
  }

  /**
   * CCommandBuffer::AddText: queues each command of `text`; `wait [n]` delays
   * the ones after it by n frames (default 1). `front` puts this frame's
   * commands before everything already queued (an alias or exec expanding).
   */
  addText(text: string, source: CommandSource, depth = 0, front = false): void {
    let tick = this.curTick;
    const now: Queued[] = [];
    for (const cmd of splitCommands(text)) {
      const t = tokenize(cmd);
      const head = t?.argv[0]?.toLowerCase();
      if (head === 'wait') {
        const n = t && t.argv.length > 1 ? Math.trunc(atof(t.argv[1])) : 1;
        tick += Math.max(0, Math.min(MAX_WAIT_FRAMES, n));
        continue;
      }
      // Commands after a wait start a fresh expansion chain (a looping alias with a wait is legitimate).
      const q: Queued = { text: cmd, tick, depth: tick > this.curTick ? 0 : depth, source };
      if (front && tick <= this.curTick) now.push(q);
      else this.insertOrdered(q);
    }
    if (now.length) this.queue.splice(0, 0, ...now);
  }

  private insertOrdered(q: Queued): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].tick > q.tick) i--;
    this.queue.splice(i, 0, q);
  }

  /** Runs every command due by now (re-entrant calls just return; the outer loop picks them up). */
  execute(): void {
    if (this.executing) return;
    this.executing = true;
    let count = 0;
    try {
      while (this.queue.length && this.queue[0].tick <= this.curTick) {
        if (++count > MAX_COMMANDS_PER_FRAME) {
          this.queue = this.queue.filter((q) => q.tick > this.curTick);
          this.print(`Command buffer overflow: more than ${MAX_COMMANDS_PER_FRAME} commands in one frame, the rest were dropped`, 'error');
          break;
        }
        const q = this.queue.shift()!;
        this.executeCommand(q.text, q.source, q.depth);
      }
    } finally {
      this.executing = false;
    }
  }

  /** One frame passed: runs what `wait` held for it. */
  frame(): void {
    this.curTick++;
    if (this.queue.length) this.execute();
  }

  /** Commands waiting for later frames. */
  get pending(): number {
    return this.queue.length;
  }

  /** Cmd_ExecuteCommand for one command. */
  executeCommand(text: string, source: CommandSource, depth = 0): void {
    const t = tokenize(text);
    if (!t) {
      this.print('CCommand::Tokenize: Encountered command which overflows the tokenizer buffer.. Skipping!', 'warn');
      return;
    }
    if (t.clamped) this.print('CCommand::Tokenize: Encountered command which overflows the argument buffer.. Clamped!', 'warn');
    if (!t.argv.length) return;
    const name = t.argv[0];
    const key = name.toLowerCase();

    const alias = this.aliases.get(key);
    if (alias !== undefined) {
      if (depth >= MAX_ALIAS_DEPTH) {
        this.print(`Alias "${name}" nests deeper than ${MAX_ALIAS_DEPTH} without a wait: stopped (recursive alias?)`, 'error');
        return;
      }
      this.addText(alias, 'alias', depth + 1, true);
      return;
    }

    const cmd = this.commands.get(key);
    if (cmd) {
      if (cmd.flags && cmd.flags & FCVAR_CHEAT && !cmd.serverSide && !this.cheatsAllowed()) {
        this.print(`Can't use cheat command ${cmd.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
        return;
      }
      try {
        cmd.run({ argv: t.argv, argS: t.argS, source, con: this, depth });
      } catch (e) {
        this.print(`${cmd.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
      return;
    }

    const cv = this.cvars.get(key);
    if (cv) {
      if (t.argv.length === 1) {
        if (cv.hasFlag(FCVAR_GAMEDLL) && this.forwardServerCvar) {
          // The server's value is what it last replicated; ask it as well (it answers in the console).
          this.forwardServerCvar(cv, null);
          return;
        }
        for (const l of cv.describe()) this.print(l);
        return;
      }
      // A string cvar takes the raw argument text (so `name "a b"` and `name a b` both work).
      const value = cv.type === 'string' ? stripQuotes(t.argS) : t.argv[1];
      this.setCvarFrom(cv, value, source);
      return;
    }

    this.print(`Unknown command "${name}"`, 'warn');
  }

  /** Sets a cvar as a console command does (server cvars forward, replicated and cheat ones are checked). */
  setCvarFrom(cv: ConVar, value: string, _source: CommandSource): boolean {
    if (cv.hasFlag(FCVAR_GAMEDLL) && this.forwardServerCvar) {
      this.forwardServerCvar(cv, value);
      return true;
    }
    if (cv.hasFlag(FCVAR_REPLICATED)) {
      this.print(`Can't change replicated ConVar ${cv.name} from console of client, only server operator can change its value`, 'error');
      return false;
    }
    if (cv.hasFlag(FCVAR_CHEAT) && !this.cheatsAllowed()) {
      this.print(`Can't use cheat cvar ${cv.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
      return false;
    }
    const r = cv.set(value);
    if (!r.ok) {
      this.print(r.error, 'error');
      return false;
    }
    if (r.changed && cv.hasFlag(FCVAR_ARCHIVE) && !cv.settingsBacked) this.onArchiveChange?.(cv);
    return true;
  }

  /** A value the server sent (replicated cvars): stored as is, never forwarded back. */
  setReplicated(name: string, value: string): boolean {
    const cv = this.cvar(name);
    if (!cv) return false;
    return cv.set(value).ok;
  }

  // ─── Completion ──────────────────────────────────────────────────────────

  /** Names (commands, cvars, aliases) that start with `prefix`, hidden ones left out. */
  matchNames(prefix: string, max = 64): string[] {
    const p = prefix.toLowerCase();
    const out: string[] = [];
    for (const c of this.commands.values()) if (!(c.flags && c.flags & FCVAR_HIDDEN) && c.name.toLowerCase().startsWith(p)) out.push(c.name);
    for (const c of this.cvars.values()) if (!c.hasFlag(FCVAR_HIDDEN) && c.name.toLowerCase().startsWith(p)) out.push(c.name);
    for (const a of this.aliases.keys()) if (a.startsWith(p)) out.push(a);
    out.sort();
    return out.slice(0, max);
  }

  /** Completion for the last command of `line`: a command name, or an argument value where one is known. */
  complete(line: string, max = 64): Completion {
    let start = lastCommandStart(line);
    while (start < line.length && /\s/.test(line[start])) start++;
    const seg = line.slice(start);
    const words = roughWords(seg);
    const trailing = /\s$/.test(seg);
    if (words.length <= 1 && !trailing) return { start, items: this.matchNames(words[0] ?? '', max) };
    const name = words[0];
    const index = trailing ? words.length : words.length - 1;
    const partial = (trailing ? '' : words[words.length - 1]).toLowerCase();
    let values: readonly string[] = [];
    const cmd = this.command(name);
    const cv = this.cvar(name);
    if (cmd?.complete) values = cmd.complete(index, words.slice(0, index));
    else if (cv && index === 1) values = cv.values ?? (cv.type === 'bool' ? ['0', '1'] : []);
    const before = words.slice(0, index).map((w, i) => (i === 0 ? w : quoteArg(w)));
    const items = values
      .filter((v) => v.toLowerCase().startsWith(partial))
      .slice(0, max)
      .map((v) => [...before, quoteArg(v)].join(' '));
    return { start, items };
  }

  // ─── config.cfg ──────────────────────────────────────────────────────────

  /** config.cfg as host_writeconfig writes it: the game's extra lines (binds), then archived cvars not kept by the settings. */
  configText(): string {
    const lines = ['// Written by the developer console (host_writeconfig). Put your own commands in autoexec.cfg.'];
    lines.push(...this.configExtras());
    for (const cv of this.allCvars()) {
      if (!cv.hasFlag(FCVAR_ARCHIVE) || cv.settingsBacked || cv.hasFlag(FCVAR_GAMEDLL)) continue;
      lines.push(`${cv.name} ${quoteArg(cv.string)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  writeConfig(name = 'config.cfg'): boolean {
    return this.files?.write(name, this.configText()) ?? false;
  }

  /** exec: runs a stored cfg before anything else queued. False when it does not exist. */
  exec(name: string, depth = 0, silent = false): boolean {
    const n = cfgName(name);
    const text = n ? this.files?.read(n) : null;
    if (!n || text == null) {
      if (!silent) this.print(`exec: couldn't exec ${name}`, 'warn');
      return false;
    }
    if (depth >= MAX_ALIAS_DEPTH) {
      this.print(`exec: ${n} nests too deep (a cfg that execs itself?)`, 'error');
      return false;
    }
    if (!silent) this.print(`execing ${n}`, 'dev');
    this.addText(text, 'cfg', depth + 1, true);
    return true;
  }

  // ─── Built-in commands ───────────────────────────────────────────────────

  private registerBuiltins(): void {
    const cvarNames = () => this.allCvars().filter((c) => !c.hasFlag(FCVAR_HIDDEN)).map((c) => c.name);
    const allNames = () => this.matchNames('', 10_000);

    this.registerCommand({
      name: 'echo',
      help: 'Echo text to console.',
      run: ({ argv }) => this.print(argv.slice(1).join(' ')),
    });
    this.registerCommand({
      name: 'clear',
      help: 'Clear all console output.',
      run: () => this.clear(),
    });
    this.registerCommand({
      name: 'help',
      help: 'Find help about a convar/concommand.',
      complete: (i) => (i === 1 ? allNames() : []),
      run: ({ argv }) => {
        if (argv.length < 2) {
          this.print('Usage:  help <cvarname>');
          return;
        }
        const name = argv[1];
        const cv = this.cvar(name);
        const cmd = this.command(name);
        const al = this.alias(name);
        if (cv) for (const l of cv.describe()) this.print(l);
        else if (cmd) {
          this.print(`"${cmd.name}"`);
          const f = flagNames(cmd.flags ?? 0);
          if (f) this.print(` ${f}`);
          if (cmd.help) this.print(` - ${cmd.help}`);
        } else if (al !== null) this.print(`"${name}" is an alias for: ${al}`);
        else this.print(`help:  no cvar or command named ${name}`, 'warn');
      },
    });
    this.registerCommand({
      name: 'find',
      help: 'Find concommands with the specified string in their name/help text.',
      run: ({ argv }) => {
        if (argv.length < 2) {
          this.print('Usage:  find <string>');
          return;
        }
        const q = argv[1].toLowerCase();
        let n = 0;
        for (const cv of this.allCvars()) {
          if (cv.hasFlag(FCVAR_HIDDEN)) continue;
          if (cv.name.toLowerCase().includes(q) || cv.help.toLowerCase().includes(q)) {
            for (const l of cv.describe()) this.print(l);
            n++;
          }
        }
        for (const c of this.allCommands()) {
          if (c.flags && c.flags & FCVAR_HIDDEN) continue;
          if (c.name.toLowerCase().includes(q) || (c.help ?? '').toLowerCase().includes(q)) {
            this.print(`"${c.name}"${c.flags ? ` ${flagNames(c.flags)}` : ''}${c.help ? ` - ${c.help}` : ''}`);
            n++;
          }
        }
        if (!n) this.print(`find: nothing matches "${argv[1]}"`);
      },
    });
    this.registerCommand({
      name: 'cvarlist',
      help: 'Show the list of convars/concommands.',
      run: ({ argv }) => {
        const prefix = (argv[1] ?? '').toLowerCase();
        let n = 0;
        this.print('cvar list\n--------------');
        const rows: Array<[string, string]> = [];
        for (const cv of this.allCvars()) if (!cv.hasFlag(FCVAR_HIDDEN)) rows.push([cv.name, `: ${cv.string.padEnd(8)} : ${flagNames(cv.flags).padEnd(10)} : ${cv.help}`]);
        for (const c of this.allCommands()) if (!(c.flags && c.flags & FCVAR_HIDDEN)) rows.push([c.name, `: cmd      : ${flagNames(c.flags ?? 0).padEnd(10)} : ${c.help ?? ''}`]);
        rows.sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, rest] of rows) {
          if (prefix && !name.toLowerCase().startsWith(prefix)) continue;
          this.print(`${name.padEnd(32)}${rest}`);
          n++;
        }
        this.print(`--------------\n${n} total convars/concommands`);
      },
    });
    this.registerCommand({
      name: 'toggle',
      help: 'Toggles a convar on or off, or cycles through a set of values.',
      complete: (i) => (i === 1 ? cvarNames() : []),
      run: ({ argv, source }) => {
        const cv = argv[1] ? this.cvar(argv[1]) : null;
        if (!cv) {
          this.print(argv[1] ? `toggle: no cvar named ${argv[1]}` : 'Usage:  toggle <cvar> [value1] [value2] [value3]...', 'warn');
          return;
        }
        if (argv.length <= 2) {
          this.setCvarFrom(cv, cv.bool ? '0' : '1', source);
          return;
        }
        // ToggleConVar_f: the value after the current one, wrapping.
        const vals = argv.slice(2);
        const i = vals.findIndex((v) => v === cv.string || (cv.type !== 'string' && atof(v) === cv.float));
        this.setCvarFrom(cv, vals[(i + 1) % vals.length], source);
      },
    });
    this.registerCommand({
      name: 'incrementvar',
      help: 'Increment specified convar value: incrementvar <cvar> <min> <max> <delta>.',
      complete: (i) => (i === 1 ? cvarNames() : []),
      run: ({ argv, source }) => {
        const cv = argv[1] ? this.cvar(argv[1]) : null;
        if (!cv || argv.length < 5) {
          this.print('Usage:  incrementvar <cvar> <minValue> <maxValue> <delta>', 'warn');
          return;
        }
        const min = atof(argv[2]);
        const max = atof(argv[3]);
        const delta = atof(argv[4]);
        let v = cv.float + delta;
        // CON_COMMAND( incrementvar ): past an end it wraps to the other.
        if (v > max) v = min;
        else if (v < min) v = max;
        this.setCvarFrom(cv, formatNumber(v), source);
      },
    });
    this.registerCommand({
      name: 'alias',
      help: 'Alias a command: alias <name> "<commands>".',
      run: ({ argv }) => {
        if (argv.length === 1) {
          this.print('Current alias commands:');
          for (const [n, v] of this.allAliases()) this.print(`${n} : ${v}`);
          return;
        }
        const name = argv[1];
        const key = name.toLowerCase();
        if (argv.length === 2) {
          const v = this.aliases.get(key);
          this.print(v !== undefined ? `${key} : ${v}` : `alias: no alias named ${name}`);
          return;
        }
        if (name.length >= MAX_ALIAS_NAME) {
          this.print('Alias name is too long', 'error');
          return;
        }
        if (this.commands.has(key) || this.cvars.has(key) || key === 'wait') {
          this.print(`Cannot alias an existing command or variable: ${name}`, 'error');
          return;
        }
        if (!this.aliases.has(key) && this.aliases.size >= MAX_ALIASES) {
          this.print(`alias: too many aliases (${MAX_ALIASES})`, 'error');
          return;
        }
        // Cmd_Alias_f: the rest of the arguments, joined by spaces.
        this.aliases.set(key, argv.slice(2).join(' ').slice(0, COMMAND_MAX_LENGTH * 2));
      },
    });
    this.registerCommand({
      name: 'exec',
      help: 'Execute script file: exec <name>.',
      complete: (i) => (i === 1 ? (this.files?.list() ?? []) : []),
      run: (ctx) => {
        if (ctx.argv.length < 2) {
          this.print('Usage:  exec <filename>', 'warn');
          return;
        }
        this.exec(ctx.argv[1], ctx.depth);
      },
    });
    this.registerCommand({
      name: 'host_writeconfig',
      help: 'Store current settings to config.cfg (or a named cfg).',
      run: ({ argv }) => {
        const name = cfgName(argv[1] ?? 'config.cfg');
        if (!name) {
          this.print('host_writeconfig: invalid file name', 'error');
          return;
        }
        if (this.writeConfig(name)) this.print(`Wrote ${name}`);
        else this.print(`host_writeconfig: couldn't write ${name} (storage unavailable or full)`, 'error');
      },
    });
    this.registerCommand({
      name: 'history',
      help: 'Shows the console command history.',
      run: () => {
        this.hist.forEach((h, i) => this.print(`${String(i + 1).padStart(3)}: ${h}`));
      },
    });
    this.registerCommand({
      name: 'wait',
      help: 'Delay the commands after it by one frame, or <n> frames.',
      // Handled by the buffer (addText); reaching here means it was the whole line.
      run: () => {},
    });
  }
}

function stripQuotes(s: string): string {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t.startsWith('"') ? t.slice(1) : t;
}
