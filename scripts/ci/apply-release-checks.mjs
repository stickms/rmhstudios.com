/* eslint-disable no-console -- repository administration CLI */
// Default is a reviewable plan. --apply first proves the checks exist on main.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const repo = process.env.GITHUB_REPOSITORY || 'stickms/rmhstudios.com';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid repository');
const policy = JSON.parse(readFileSync('.github/release-checks-ruleset.json', 'utf8'));
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(policy, null, 2));
} else {
  for (const [file, job] of [['web-ci.yml', 'required-checks'], ['candidate-image.yml', 'candidate-image']]) {
    const content = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/contents/.github/workflows/${file}?ref=main`], { encoding: 'utf8' }));
    if (!Buffer.from(content.content, 'base64').toString().includes(`  ${job}:`)) throw new Error(`${job} is not on main; merge the implementation first`);
  }
  const policies = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/rulesets?per_page=100`], { encoding: 'utf8' }));
  const existing = policies.find(rule => rule.name === policy.name);
  const endpoint = `repos/${repo}/rulesets${existing ? `/${existing.id}` : ''}`;
  execFileSync('gh', ['api', '--method', existing ? 'PUT' : 'POST', endpoint, '--input', '-'], { input: JSON.stringify(policy), stdio: ['pipe', 'inherit', 'inherit'] });
}
