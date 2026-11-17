#!/usr/bin/env node

import { login } from './commands/login.js';
import { whoami } from './commands/whoami.js';
import { pushBuild } from './commands/push-build.js';
import { listBuilds } from './commands/list-builds.js';
import { logout } from './commands/logout.js';
import { color } from './lib/output.js';

const RMH_COMMANDS: Record<string, (args: string[]) => void | Promise<void>> = {
  login,
  whoami,
  'push-build': pushBuild,
  'list-builds': listBuilds,
  logout,
};

function showHelp(): void {
  console.log('');
  console.log(color.bold(`  rmh${color.violet('code')}`));
  console.log(color.dim('  AI-powered coding assistant with RMH integrations'));
  console.log('');
  console.log('  RMH Commands:');
  console.log(`    ${color.cyan('login')}        Authenticate with your RMH account`);
  console.log(`    ${color.cyan('whoami')}       Show current authenticated user`);
  console.log(`    ${color.cyan('push-build')}   Publish a project to User Builds`);
  console.log(`    ${color.cyan('list-builds')}  List your published builds`);
  console.log(`    ${color.cyan('logout')}       Sign out and remove stored token`);
  console.log('');
  console.log(color.dim('  All other arguments are passed to Claude Code.'));
  console.log(color.dim('  Set CLAUDE_CODE_PATH if claude is not in PATH.'));
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // If first arg is an RMH command, handle it
  if (command && command in RMH_COMMANDS) {
    try {
      await RMH_COMMANDS[command](args.slice(1));
    } catch (e) {
      console.error(color.red(e instanceof Error ? e.message : 'Unknown error'));
      process.exit(1);
    }
    return;
  }

  // Otherwise, pass through to Claude Code
  const { execFile } = await import('node:child_process');
  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';

  const child = execFile(claudePath, args);

  // Pipe stdio
  if (child.stdout) child.stdout.pipe(process.stdout);
  if (child.stderr) child.stderr.pipe(process.stderr);
  process.stdin.pipe(child.stdin!);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      showHelp();
    } else {
      console.error(color.red(`Failed to start Claude Code: ${err.message}`));
      process.exit(1);
    }
  });
}

main();
