/**
 * Serves the bare harness page with a minimal Vite (no TanStack/Nitro): `@` aliases the repo root.
 *
 *   pnpm exec tsx scripts/harmonic/models-harness/serve.ts [port]
 */
import path from 'node:path';
import { createServer } from 'vite';

const port = Number(process.argv[2] ?? 7405);
const repo = path.resolve(import.meta.dirname, '../../..');
const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
  resolve: { alias: { '@': repo } },
  // Some engine modules read process.env knobs (bots/nav); the browser has none.
  define: { 'process.env': '({})' },
  server: {
    port,
    host: '127.0.0.1',
    strictPort: true,
    fs: { allow: [repo, path.resolve(repo, 'node_modules')] },
  },
  optimizeDeps: { include: ['three'] },
  logLevel: 'warn',
});
await server.listen();
process.stdout.write(`harness on http://127.0.0.1:${port}/\n`);
