/**
 * Publish the site archive to the media bucket (R2), served at https://cdn.rmhstudios.com/site-archive/.
 *
 *   pnpm exec tsx scripts/site-archive/publish.ts check                # the bucket is writable
 *   pnpm exec tsx scripts/site-archive/publish.ts missing              # ids in archive-versions.json with no recording yet
 *   pnpm exec tsx scripts/site-archive/publish.ts version <id> <file>  # upload one recording
 *   pnpm exec tsx scripts/site-archive/publish.ts player <dir>         # upload play.html + ReplayWeb.page from <dir>
 *
 * Layout under site-archive/:
 *   play.html            the player /site-history frames (scripts/site-archive/player/play.html)
 *   index.html, ui.js,   ReplayWeb.page's app shell, UI and service worker. The service worker's scope is
 *   sw.js                site-archive/, so it only ever controls archive pages on the CDN origin.
 *   versions/<id>.warc.gz  one recording per version in components/site-history/archive-versions.json
 *
 * Uses the same S3_* environment as every other uploader (lib/storage/s3.server.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listObjects, putObject, s3Configured } from '../../lib/storage/s3.server';

const PREFIX = 'site-archive';
const here = path.dirname(new URL(import.meta.url).pathname);

interface Version {
  id: string;
}

function versions(): Version[] {
  return (JSON.parse(readFileSync(path.join(here, '../../components/site-history/archive-versions.json'), 'utf8')) as { versions: Version[] }).versions;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (!s3Configured()) throw new Error('S3_* is not configured');

  if (cmd === 'check') {
    await putObject(`${PREFIX}/.write-check`, Buffer.from(new Date().toISOString()), 'text/plain');
    console.log('bucket writable');
    return;
  }

  if (cmd === 'missing') {
    const have = new Set(
      (await listObjects(`${PREFIX}/versions/`)).map((k) => path.basename(k).replace(/\.warc\.gz$/, '')),
    );
    const force = (process.env.ARCHIVE_FORCE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ids = versions()
      .map((v) => v.id)
      .filter((id) => force.includes('all') || force.includes(id) || !have.has(id));
    process.stdout.write(JSON.stringify(ids));
    return;
  }

  if (cmd === 'version' && a && b) {
    if (!versions().some((v) => v.id === a)) throw new Error(`${a} is not in archive-versions.json`);
    const body = readFileSync(b);
    await putObject(`${PREFIX}/versions/${a}.warc.gz`, body, 'application/gzip');
    console.log(`published ${a} (${(body.length / 1048576).toFixed(1)} MB)`);
    return;
  }

  if (cmd === 'player' && a) {
    const files: [string, string][] = [
      ['play.html', 'text/html; charset=utf-8'],
      ['index.html', 'text/html; charset=utf-8'],
      ['ui.js', 'application/javascript'],
      ['sw.js', 'application/javascript'],
    ];
    for (const [name, type] of files) {
      await putObject(`${PREFIX}/${name}`, readFileSync(path.join(a, name)), type);
      console.log(`published ${name}`);
    }
    return;
  }

  console.error('usage: publish.ts check | missing | version <id> <file> | player <dir>');
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
