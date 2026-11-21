/**
 * Publish the site archive to the media bucket (R2), served at https://cdn.rmhstudios.com/site-archive/.
 *
 *   pnpm exec tsx scripts/site-archive/publish.ts check                # the bucket is reachable (reads only)
 *   pnpm exec tsx scripts/site-archive/publish.ts missing              # ids in archive-versions.json with no recording yet
 *   pnpm exec tsx scripts/site-archive/publish.ts needed <id>          # true unless <id> is already published
 *   pnpm exec tsx scripts/site-archive/publish.ts version <id> <file>  # upload one recording
 *   pnpm exec tsx scripts/site-archive/publish.ts player <dir>         # upload play.html + ReplayWeb.page from <dir>
 *
 * Layout under site-archive/:
 *   play.html            the player /site-history frames (scripts/site-archive/player/play.html)
 *   index.html, ui.js,   ReplayWeb.page's app shell, UI and service worker. The service worker's scope is
 *   sw.js                site-archive/, so it only ever controls archive pages on the CDN origin.
 *   versions/v2/<id>.warc.gz  one recording per version in components/site-history/archive-versions.json. The v2
 *                       is the recording format (record.mjs): a change to what a recording contains gets a new
 *                       number here and in player/play.html, so the new recordings are new objects, each uploaded
 *                       once, and nothing already published is overwritten.
 *
 * Uses the same S3_* environment as every other uploader (lib/storage/s3.server.ts).
 *
 * Every object is uploaded once. `check` only reads. A recording is written only when its object does not exist
 * yet (re-recording one is an explicit ARCHIVE_FORCE=<id>|all, the workflow's `force` input), so two runs can
 * never both upload it. A player file is written only when its bytes differ from what the bucket already holds, so
 * a run with nothing new uploads nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getObject, listObjects, objectExists, putObject, s3Configured } from '../../lib/storage/s3.server';

const PREFIX = 'site-archive';
const RECORDINGS = `${PREFIX}/versions/v2`;
const here = path.dirname(new URL(import.meta.url).pathname);

interface Version {
  id: string;
}

function forced(id: string): boolean {
  const force = (process.env.ARCHIVE_FORCE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return force.includes('all') || force.includes(id);
}

function versions(): Version[] {
  return (
    JSON.parse(readFileSync(path.join(here, '../../components/site-history/archive-versions.json'), 'utf8')) as {
      versions: Version[];
    }
  ).versions;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (!s3Configured()) throw new Error('S3_* is not configured');

  if (cmd === 'check') {
    await listObjects(`${PREFIX}/`, 1);
    console.log('bucket reachable');
    return;
  }

  if (cmd === 'missing') {
    const have = new Set((await listObjects(`${RECORDINGS}/`)).map((k) => path.basename(k).replace(/\.warc\.gz$/, '')));
    const ids = [...new Set(versions().map((v) => v.id))].filter((id) => forced(id) || !have.has(id));
    process.stdout.write(JSON.stringify(ids));
    return;
  }

  if (cmd === 'needed' && a) {
    // For one record job: is this version still to do? Prints true or false.
    process.stdout.write(String(forced(a) || !(await objectExists(`${RECORDINGS}/${a}.warc.gz`))));
    return;
  }

  if (cmd === 'version' && a && b) {
    if (!versions().some((v) => v.id === a)) throw new Error(`${a} is not in archive-versions.json`);
    const key = `${RECORDINGS}/${a}.warc.gz`;
    if (!forced(a) && (await objectExists(key))) {
      console.log(`${a} is already published; not uploading it again`);
      return;
    }
    const body = readFileSync(b);
    await putObject(key, body, 'application/gzip');
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
      const body = readFileSync(path.join(a, name));
      const current = await getObject(`${PREFIX}/${name}`);
      if (current && current.body.equals(body)) {
        console.log(`${name} unchanged`);
        continue;
      }
      await putObject(`${PREFIX}/${name}`, body, type);
      console.log(`published ${name}`);
    }
    return;
  }

  console.error('usage: publish.ts check | missing | needed <id> | version <id> <file> | player <dir>');
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
