import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');

describe('supervisor deployment boundary', () => {
  it('starts the Go supervisor directly without copying the host repository', () => {
    expect(compose).toContain('command: ["/app/bin/supervisor"]');
    expect(compose).not.toContain('RMHBOT_REPO_PATH');
    expect(compose).not.toContain('/mnt/rmhbot-repo-source');
    expect(compose).not.toContain('rmhbot-worktrees');
  });

  it('does not ship Git in the production supervisor image', () => {
    expect(dockerfile).not.toMatch(/apk add --no-cache[^\n]*\bgit\b/);
    expect(dockerfile).not.toContain('.rmhbot-worktrees');
  });
});
