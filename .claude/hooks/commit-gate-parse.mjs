#!/usr/bin/env node
/**
 * Reads a Claude Code PreToolUse(Bash) payload on stdin and prints one line per
 * `git commit` the command would run:
 *
 *   <skip 0|1> TAB <stages 0|1> TAB <absolute directory>
 *
 * - **directory**: where that commit happens. The payload's `cwd`, moved by any
 *   `cd` earlier in the command and by `git -C <dir>`. This is the whole point
 *   (audit OP1): the hook used to gate `$CLAUDE_PROJECT_DIR` for every commit, so
 *   a commit in a git worktree was checked against the wrong tree or not at all.
 * - **stages**: the same command changes the index before committing (`git add …
 *   && git commit`, `git commit -a`, a path-limited commit, an earlier commit).
 *   The hook runs BEFORE any of it, so the staged tree is not yet the commit; the
 *   hook gates the working tree instead.
 * - **skip**: the command carries the documented escape hatch,
 *   `RMH_SKIP_COMMIT_GATE=1 git commit …` (inline, through `env`, or exported
 *   earlier in the command). The hook's own environment never sees a variable
 *   written in the command, so it has to be read from the text.
 *
 * It is a shell *reader*, not a shell: quotes, heredocs, `$(…)`, `&& || ; |`,
 * `sh -c '…'` and the usual wrappers are understood; variables are not expanded.
 * Two rules keep its mistakes on the safe side: a directory it cannot resolve
 * stays the directory it had, and a command that mentions `git commit` in a form
 * it cannot read is still reported (at the payload's cwd) — the substring match
 * the hook used before this file existed.
 *
 * Tested by lib/__tests__/commit-gate-hook.test.ts.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Index-changing subcommands: after one of these, "staged now" is not "staged at commit". */
const INDEX_WRITERS = new Set([
  'add',
  'rm',
  'mv',
  'stage',
  'restore',
  'reset',
  'apply',
  'checkout',
  'switch',
  'stash',
  'merge',
  'cherry-pick',
  'revert',
  'pull',
  'rebase',
  'am',
  'update-index',
  'read-tree',
  'commit',
]);
const KEYWORDS = new Set([
  '{',
  '}',
  '(',
  ')',
  'then',
  'do',
  'else',
  'elif',
  'if',
  'while',
  'until',
  '!',
  'fi',
  'done',
]);
const WRAPPERS = new Set(['command', 'exec', 'time', 'nohup', 'sudo', 'nice', 'builtin']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;

/**
 * Remove heredoc bodies, so a commit message is never read as shell. Quote state is
 * deliberately ignored — `"$(cat <<'EOF' … EOF)"` puts a heredoc inside double quotes
 * — and the guard is the closing line instead: `<<WORD` is only a heredoc when a later
 * line is exactly WORD.
 */
function stripHeredocs(src) {
  const opener = /<<-?[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/g;
  let out = '';
  let from = 0;
  for (;;) {
    opener.lastIndex = from;
    const match = opener.exec(src);
    if (!match) break;
    if (src[match.index - 1] === '<' || src[match.index + 2] === '<') {
      // `<<<` is a here-string, not a heredoc.
      out += src.slice(from, match.index + 3);
      from = match.index + 3;
      continue;
    }
    const delimiter = match[1] ?? match[2] ?? match[3];
    const lineEnd = src.indexOf('\n', opener.lastIndex);
    let bodyEnd = -1;
    for (let cursor = lineEnd + 1; lineEnd !== -1 && cursor <= src.length;) {
      const next = src.indexOf('\n', cursor);
      const line = src.slice(cursor, next === -1 ? src.length : next);
      if (line.replace(/^\t+/, '') === delimiter) {
        bodyEnd = next === -1 ? src.length : next;
        break;
      }
      if (next === -1) break;
      cursor = next + 1;
    }
    if (bodyEnd === -1) {
      out += src.slice(from, opener.lastIndex);
      from = opener.lastIndex;
      continue;
    }
    // Keep the command text around the operator; drop the operator, the body and the closing line.
    out += src.slice(from, match.index) + ' ' + src.slice(opener.lastIndex, lineEnd);
    from = bodyEnd;
  }
  return out + src.slice(from);
}

/** Split a script into simple commands, each a list of words with the quotes removed. */
function tokenize(script) {
  const src = stripHeredocs(script);
  const commands = [];
  let words = [];
  let word = null;
  const push = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const end = () => {
    push();
    if (words.length) commands.push(words);
    words = [];
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      if (src[i + 1] !== '\n') word = (word ?? '') + (src[i + 1] ?? '');
      i += 2;
    } else if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      const stop = close === -1 ? src.length : close;
      word = (word ?? '') + src.slice(i + 1, stop);
      i = stop + 1;
    } else if (ch === '"') {
      word = word ?? '';
      i++;
      let depth = 0;
      while (i < src.length && (src[i] !== '"' || depth > 0)) {
        if (src[i] === '\\' && depth === 0) {
          word += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (src[i] === '$' && src[i + 1] === '(') depth++;
        else if (src[i] === ')' && depth > 0) depth--;
        word += src[i++];
      }
      i++;
    } else if (ch === '$' && src[i + 1] === '(') {
      // An unquoted command substitution is one opaque word.
      let depth = 0;
      word = word ?? '';
      do {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
        word += src[i++];
      } while (i < src.length && depth > 0);
    } else if (ch === '#' && word === null) {
      const eol = src.indexOf('\n', i);
      i = eol === -1 ? src.length : eol;
    } else if (ch === ' ' || ch === '\t') {
      push();
      i++;
    } else if (ch === '\n' || ch === ';' || ch === '&' || ch === '|') {
      end();
      i++;
    } else if (ch === '(' || ch === ')') {
      end();
      i++;
    } else {
      word = (word ?? '') + ch;
      i++;
    }
  }
  end();
  return commands;
}

function resolveDir(from, target) {
  if (target === undefined || target === '-' || /[$`]/.test(target)) return from;
  if (target === '~') return homedir();
  if (target.startsWith('~/')) return resolve(homedir(), target.slice(2));
  return resolve(from, target);
}

/**
 * @param {string} script
 * @param {{ cwd: string, skip: boolean, touched: Set<string> }} state mutated as the script "runs"
 * @param {{ dir: string, skip: boolean, stages: boolean }[]} found
 */
function walk(script, state, found) {
  for (const original of tokenize(script)) {
    const words = [...original];
    let skip = state.skip;
    for (;;) {
      const head = words[0];
      if (head === undefined) break;
      if (KEYWORDS.has(head) || WRAPPERS.has(head)) {
        words.shift();
        continue;
      }
      if (head === 'env') {
        words.shift();
        while (words[0]?.startsWith('-')) words.shift();
        continue;
      }
      const assignment = ASSIGNMENT.exec(head);
      if (assignment) {
        if (assignment[1] === 'RMH_SKIP_COMMIT_GATE') skip = assignment[2] === '1';
        words.shift();
        // A bare `NAME=value` with no command sets the variable for what follows.
        if (words.length === 0 && assignment[1] === 'RMH_SKIP_COMMIT_GATE') state.skip = skip;
        continue;
      }
      break;
    }
    const [name, ...args] = words;
    if (name === undefined) continue;

    if (name === 'export') {
      for (const arg of args) {
        const assignment = ASSIGNMENT.exec(arg);
        if (assignment?.[1] === 'RMH_SKIP_COMMIT_GATE') state.skip = assignment[2] === '1';
      }
    } else if (name === 'cd' || name === 'pushd') {
      state.cwd = resolveDir(
        state.cwd,
        args.find((arg) => !arg.startsWith('-')),
      );
    } else if (SHELLS.has(name)) {
      const flag = args.findIndex((arg) => /^-[a-z]*c$/.test(arg));
      if (flag !== -1 && args[flag + 1] !== undefined) {
        walk(args[flag + 1], { cwd: state.cwd, skip, touched: state.touched }, found);
      }
    } else if (name === 'eval') {
      walk(args.join(' '), state, found);
    } else if (name === 'git') {
      let dir = state.cwd;
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) {
        if (args[i] === '-C') dir = resolveDir(dir, args[++i]);
        else if (args[i] === '-c') i++;
        i++;
      }
      const sub = args[i];
      const rest = args.slice(i + 1);
      if (sub === 'commit') {
        const stagesItself =
          state.touched.has(dir) ||
          rest.some(
            (arg) =>
              arg === '--all' ||
              arg === '--include' ||
              arg === '--only' ||
              arg === '--' ||
              arg === '--patch' ||
              arg === '--interactive' ||
              /^-[A-Za-z]*[aiop][A-Za-z]*$/.test(arg),
          );
        found.push({ dir, skip, stages: stagesItself });
      }
      if (INDEX_WRITERS.has(sub)) state.touched.add(dir);
    }
  }
}

/** @param {{ cwd?: string, tool_input?: { command?: string } }} payload */
export function commitsIn(payload, fallbackCwd = process.cwd()) {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return [];
  const cwd = resolve(typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : fallbackCwd);
  const found = [];
  walk(command, { cwd, skip: false, touched: new Set() }, found);
  if (found.length === 0 && /git commit(?![-\w])/.test(command)) {
    // A form this reader does not understand. Gate where the command starts, as before.
    found.push({ dir: cwd, skip: false, stages: false });
  }
  /** @type {Map<string, { dir: string, skip: boolean, stages: boolean }>} */
  const byDir = new Map();
  for (const commit of found) {
    const seen = byDir.get(commit.dir);
    if (!seen) byDir.set(commit.dir, { ...commit });
    else {
      // Two commits in one checkout: the second's content depends on the first.
      seen.skip = seen.skip && commit.skip;
      seen.stages = true;
    }
  }
  return [...byDir.values()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const commits = commitsIn(JSON.parse(input), process.env.CLAUDE_PROJECT_DIR || process.cwd());
  for (const { dir, skip, stages } of commits) {
    process.stdout.write(`${skip ? 1 : 0}\t${stages ? 1 : 0}\t${dir}\n`);
  }
}
