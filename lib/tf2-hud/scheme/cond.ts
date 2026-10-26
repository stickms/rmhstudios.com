/**
 * Platform conditionals — `[$WIN32]`, `[!$X360]`, `[$WIN32 && !$OSX]`.
 *
 * Source resolves these at load time against the platform the game runs on.
 * The preview evaluates them against a selectable environment (PC by default),
 * so the same file previews as the PC HUD or, for authors who care, the console
 * one.
 */

export interface CondEnv {
  /** Names without the `$`, upper-case. */
  readonly defined: ReadonlySet<string>;
}

export const PC_ENV: CondEnv = { defined: new Set(['WIN32', 'WINDOWS']) };
export const LINUX_ENV: CondEnv = { defined: new Set(['WIN32', 'POSIX', 'LINUX']) };
export const MAC_ENV: CondEnv = { defined: new Set(['WIN32', 'POSIX', 'OSX']) };
export const X360_ENV: CondEnv = { defined: new Set(['X360', 'GAMECONSOLE']) };

export const COND_ENVS = {
  windows: PC_ENV,
  linux: LINUX_ENV,
  mac: MAC_ENV,
  x360: X360_ENV,
} as const;

export type CondEnvName = keyof typeof COND_ENVS;

/**
 * Evaluate a conditional's inner text (without brackets). Malformed input
 * evaluates to `true` so a typo never hides content from the preview.
 */
export function evalCond(text: string | undefined, env: CondEnv): boolean {
  if (!text) return true;
  const tokens = text.match(/\$[A-Za-z0-9_]+|&&|\|\||!|\(|\)/g);
  if (!tokens) return true;
  let i = 0;

  const parseOr = (): boolean => {
    let v = parseAnd();
    while (tokens[i] === '||') {
      i++;
      const r = parseAnd();
      v = v || r;
    }
    return v;
  };
  const parseAnd = (): boolean => {
    let v = parseNot();
    while (tokens[i] === '&&') {
      i++;
      const r = parseNot();
      v = v && r;
    }
    return v;
  };
  const parseNot = (): boolean => {
    if (tokens[i] === '!') {
      i++;
      return !parseNot();
    }
    return parseAtom();
  };
  const parseAtom = (): boolean => {
    const t = tokens[i++];
    if (t === '(') {
      const v = parseOr();
      if (tokens[i] === ')') i++;
      return v;
    }
    if (t?.startsWith('$')) return env.defined.has(t.slice(1).toUpperCase());
    return true;
  };

  return parseOr();
}
