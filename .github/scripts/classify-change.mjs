/** Unknown inputs always take the full path; only proven non-runtime inputs skip builds. */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function classifyFiles(files) {
  if (!files.length) return { checks: true, frontend: true, candidate: true };
  const docsOnly = file => (file.startsWith('docs/') && !file.endsWith('/package.json')) || /(^|\/)(AGENTS|CLAUDE)\.md$/.test(file);
  const noFrontend = file => docsOnly(file) || /(^|\/)(__tests__|__mocks__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.startsWith('go-services/') || file.startsWith('deploy/') || file.startsWith('.github/') || file === 'deploy.sh';
  const testOnly = file => /(^|\/)(__tests__|__mocks__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
  return { checks: !files.every(docsOnly), frontend: !files.every(noFrontend), candidate: !files.every(file => docsOnly(file) || testOnly(file)) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let result = { checks: true, frontend: true, candidate: true };
  if (process.env.BASE_SHA && /^[a-f0-9]{40}$/.test(process.env.BASE_SHA)) {
    try {
      const files = execFileSync('git', ['diff', '--name-only', '-z', process.env.BASE_SHA, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean);
      result = classifyFiles(files);
    } catch { /* Missing history is a full check, never a skip. */ }
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  for (const [key, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
