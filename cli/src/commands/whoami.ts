import { requireAuth } from '../lib/config.js';
import { apiRequest } from '../lib/api.js';
import { error, color } from '../lib/output.js';
import type { UserInfo } from '../types.js';

export async function whoami(): Promise<void> {
  const config = requireAuth();

  try {
    const data = await apiRequest<{ valid: boolean; user: UserInfo }>(
      '/api/rmhcode/auth/validate',
      { method: 'POST', body: { token: config.token } }
    );

    const u = data.user;
    console.log('');
    console.log(color.bold('  Logged in as:'));
    console.log(`  Name:     ${u.name}`);
    if (u.username) console.log(`  Username: ${color.violet(`@${u.username}`)}`);
    if (u.email) console.log(`  Email:    ${color.dim(u.email)}`);
    console.log('');
  } catch {
    error('Token is invalid or expired. Run `rmhcode login` to re-authenticate.');
    process.exit(1);
  }
}
