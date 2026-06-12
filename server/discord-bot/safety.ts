const PROTECTED_PATHS = ['.env', 'server/discord-bot'];
const PROTECTED_PREFIXES = ['server/discord-bot/', '.env.'];

const SECRET_PATTERNS = [
  /DEEPSEEK_API_KEY\s*=\s*\S+/,
  /DISCORD_.*TOKEN\s*=\s*\S+/,
  /GITHUB_TOKEN\s*=\s*\S+/,
  /BETTER_AUTH_SECRET\s*=\s*\S+/,
  /TOKEN_ENCRYPTION_KEY\s*=\s*\S+/,
];

function normalizePath(filePath: string): string {
  return filePath.replace(/^[./\\]+/, '').replace(/\\/g, '/');
}

function isProtectedPath(filePath: string): boolean {
  const n = normalizePath(filePath);
  if (PROTECTED_PATHS.includes(n)) return true;
  if (PROTECTED_PREFIXES.some(p => n.startsWith(p))) return true;
  return false;
}

export function checkWriteSafety(
  path: string,
  content: string,
): { allowed: boolean; reason?: string } {
  if (isProtectedPath(path)) {
    return { allowed: false, reason: `\`${path}\` is a protected path and cannot be modified.` };
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason: `Write blocked: content matches secret pattern \`${pattern.source}\`.`,
      };
    }
  }
  return { allowed: true };
}

export function checkDeleteSafety(
  path: string,
  deletedFilesThisSession: string[],
): { allowed: boolean; reason?: string } {
  if (isProtectedPath(path)) {
    return { allowed: false, reason: `\`${path}\` is a protected path and cannot be deleted.` };
  }
  if (deletedFilesThisSession.length >= 10) {
    return { allowed: false, reason: 'Bulk-delete limit reached (10 files per session).' };
  }
  return { allowed: true };
}
