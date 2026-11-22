/** Argument parsing for `rmhcode release`, kept free of I/O so it can be tested on its own. */

export interface ReleaseArgs {
  version?: string;
  notes?: string;
  commit?: string;
  build?: string;
}

const FLAGS: Record<string, keyof ReleaseArgs> = {
  '--version': 'version',
  '--notes': 'notes',
  '--commit': 'commit',
  '--build': 'build',
};

/** `--flag value` or `--flag=value`. Throws a readable error on an unknown flag or a missing value. */
export function parseReleaseArgs(args: string[]): ReleaseArgs {
  const out: ReleaseArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const key = FLAGS[flag];
    if (!key)
      throw new Error(
        `Unknown option ${arg}. Usage: rmhcode release [--build <slug>] [--version <v>] [--notes <file>] [--commit <sha>]`,
      );
    const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) {
      throw new Error(`${flag} needs a value`);
    }
    out[key] = value;
  }
  return out;
}

/** The first line of `git rev-parse HEAD` output when it is a full commit hash, else undefined. */
export function commitFromGit(output: string): string | undefined {
  const hash = output.trim().split('\n')[0]?.trim() ?? '';
  return /^[0-9a-f]{40}$/i.test(hash) ? hash.toLowerCase() : undefined;
}
