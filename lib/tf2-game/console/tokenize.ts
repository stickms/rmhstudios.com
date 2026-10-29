/**
 * The Source console's parser, as the engine does it:
 *
 *   - `splitCommands` is CCommandBuffer::AddText's GetNextCommandLength: a
 *     line of text becomes commands at every `;` and newline that is not inside
 *     double quotes, and `//` (outside quotes) comments out the rest of the line.
 *   - `tokenize` is CCommand::Tokenize over CUtlBuffer::ParseToken: whitespace
 *     separates arguments, a double-quoted run is one argument (no escapes; an
 *     unterminated quote runs to the end), and each of the break characters
 *     `{ } ( ) ' :` is an argument of its own (`echo don't` → `echo`, `don`,
 *     `'`, `t`, exactly as in the engine). `argS` is the raw text from the
 *     first argument on (what `say` and `echo`-style commands read).
 *
 * `$` is not expanded (the engine never expands variables). Commands longer
 * than COMMAND_MAX_LENGTH − 1 are refused and argv is clamped to
 * COMMAND_MAX_ARGC, as in `convar.h`.
 *
 * Environment-agnostic.
 */

/** convar.h CCommand::COMMAND_MAX_ARGC. */
export const COMMAND_MAX_ARGC = 64;
/** convar.h CCommand::COMMAND_MAX_LENGTH. */
export const COMMAND_MAX_LENGTH = 512;

/** convar.cpp s_BreakSet: "{}()':". */
const BREAK_SET: ReadonlySet<string> = new Set(['{', '}', '(', ')', "'", ':']);

const isSpace = (c: string): boolean => c.charCodeAt(0) <= 32;

/** Splits text into commands (CCommandBuffer::GetNextCommandLength); empty commands are dropped. */
export function splitCommands(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let commented = false;
  const push = () => {
    if (cur.trim()) out.push(cur);
    cur = '';
    quoted = false;
    commented = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') {
      // Legacy behaviour: a newline ends the command even inside quotes.
      push();
      continue;
    }
    if (commented) continue;
    if (c === '"') {
      quoted = !quoted;
      cur += c;
      continue;
    }
    if (!quoted && c === '/' && text[i + 1] === '/') {
      commented = true;
      i++;
      continue;
    }
    if (!quoted && c === ';') {
      push();
      continue;
    }
    cur += c;
  }
  push();
  return out;
}

export interface Tokenized {
  /** argv[0] is the command name. */
  argv: string[];
  /** The raw text from argv[1] on (quotes kept), '' when there are no arguments. */
  argS: string;
  /** argv was clamped at COMMAND_MAX_ARGC. */
  clamped: boolean;
}

/** CCommand::Tokenize. Null when the command overflows the tokenizer buffer (the engine skips it). */
export function tokenize(command: string): Tokenized | null {
  if (command.length >= COMMAND_MAX_LENGTH - 1) return null;
  const argv: string[] = [];
  const n = command.length;
  let i = 0;
  let argSStart = -1;
  let clamped = false;
  for (;;) {
    while (i < n && isSpace(command[i])) i++;
    // EatCPPComment: the rest of the command is a comment.
    if (i + 1 < n && command[i] === '/' && command[i + 1] === '/') break;
    if (i >= n) break;
    if (argv.length >= COMMAND_MAX_ARGC) {
      clamped = true;
      break;
    }
    const start = i;
    let tok: string;
    const c = command[i];
    if (c === '"') {
      i++;
      const s = i;
      while (i < n && command[i] !== '"') i++;
      tok = command.slice(s, i);
      if (i < n) i++;
    } else if (BREAK_SET.has(c)) {
      tok = c;
      i++;
    } else {
      const s = i;
      while (i < n && !BREAK_SET.has(command[i]) && command[i] !== '"' && !isSpace(command[i])) i++;
      tok = command.slice(s, i);
    }
    if (argv.length === 1) argSStart = start;
    argv.push(tok);
  }
  return { argv, argS: argSStart >= 0 ? command.slice(argSStart) : '', clamped };
}

/** `argS` with one pair of surrounding quotes removed (what `say "hello there"` sends). */
export function unquoteArgS(argS: string): string {
  const s = argS.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/** Quotes an argument when the tokenizer would split it (spaces, break characters, `;`, empty). */
export function quoteArg(arg: string): string {
  if (arg === '' || /[\s;"{}()':]/.test(arg) || arg.includes('//')) return `"${arg.replace(/"/g, "'")}"`;
  return arg;
}

/**
 * Where the command under the cursor starts: the text after the last `;`
 * outside quotes (completion works on the last command of a line).
 */
export function lastCommandStart(line: string): number {
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === ';') start = i + 1;
  }
  return start;
}
