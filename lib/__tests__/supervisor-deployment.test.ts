import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');

describe('supervisor deployment boundary', () => {
  it('starts the Go supervisor directly without copying the host repository', () => {
    // Quote-agnostic: prettier (singleQuote: true) normalizes the compose file's
    // command arrays to single quotes, so assert the invariant — supervisor boots
    // directly from /app/bin/supervisor — without coupling to the quote style.
    expect(compose).toMatch(/command:\s*\[\s*['"]\/app\/bin\/supervisor['"]\s*\]/);
    expect(compose).not.toContain('RMHBOT_REPO_PATH');
    expect(compose).not.toContain('/mnt/rmhbot-repo-source');
    expect(compose).not.toContain('rmhbot-worktrees');
  });

  it('does not ship Git in the production supervisor image', () => {
    expect(dockerfile).not.toMatch(/apk add --no-cache[^\n]*\bgit\b/);
    expect(dockerfile).not.toContain('.rmhbot-worktrees');
  });
});
