import { deleteConfig } from '../lib/config.js';
import { success, info } from '../lib/output.js';

export function logout(): void {
  const deleted = deleteConfig();
  if (deleted) {
    success('Logged out successfully');
  } else {
    info('Already logged out');
  }
}
