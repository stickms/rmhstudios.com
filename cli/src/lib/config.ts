import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { RmhConfig } from '../types.js';

const CONFIG_DIR = join(homedir(), '.rmhcode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function readConfig(): RmhConfig | null {
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as RmhConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: RmhConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function deleteConfig(): boolean {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
    return true;
  }
  return false;
}

export function requireAuth(): RmhConfig {
  const config = readConfig();
  if (!config) {
    console.error('\x1b[31mNot logged in. Run `rmhcode login` first.\x1b[0m');
    process.exit(1);
  }
  return config;
}
