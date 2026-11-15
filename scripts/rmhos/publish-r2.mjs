/* eslint-disable no-console -- command-line tool output */
// Uploads an rmhOS image directory to the public R2 bucket under
// rmhos/<version>/<file> with an immutable Cache-Control, using the same S3_*
// credentials and AWS SDK client as scripts/sync-static-assets-to-r2.mjs, then
// prints the block to paste into features/rmhos/engine/image-manifest.ts.
//
//   S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET=... \
//     node scripts/rmhos/publish-r2.mjs [dir] [--force]        (default public/rmhos-dev)
//
// Safety, because a published version is immutable and old tabs keep running it:
//  - manifest.version is RECOMPUTED from the boot files (write-manifest's bootVersion) and a mismatch
//    stops the run before anything is sent;
//  - it REFUSES to overwrite: if rmhos/<version>/manifest.json already exists the run stops
//    (--force overrides, for repairing a half-published version with the same bytes);
//  - every file is checked against the manifest's size and sha256 before it is sent;
//  - files go up as whole buffers, the way sync-static-assets-to-r2.mjs does (the path that is
//    proven against R2: a streaming body makes recent SDK versions add a trailing checksum that R2
//    has had trouble with), each retried up to 3 times;
//  - manifest.json goes LAST, so a version with a manifest is complete.
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireMeta } from './image-meta.mjs';
import { pinReport } from './print-pin.mjs';
import { bootVersion } from './write-manifest.mjs';

export const CACHE_CONTROL =
  'public, max-age=31536000, immutable';
const TYPES =
  {
    '.json':
      'application/json',
    '.txt':
      'text/plain; charset=utf-8',
    '.zst':
      'application/zstd',
    '.xz':
      'application/x-xz',
  };
export const contentTypeFor =
  (
    name,
  ) =>
    TYPES[
      path.extname(
        name,
      )
    ] ??
    'application/octet-stream';

const notFound =
  (
    e,
  ) =>
    e?.name ===
      'NotFound' ||
    e?.name ===
      'NoSuchKey' ||
    e
      ?.$metadata
      ?.httpStatusCode ===
      404;

/**
 * Publishes `dir` (whose manifest.json is `manifest`) through `client` (anything with
 * `send(command)`). Returns the keys uploaded, in order.
 */
export async function publish({
  client,
  bucket,
  dir,
  manifest,
  force = false,
  attempts = 3,
  sleep = (
    ms,
  ) =>
    new Promise(
      (
        r,
      ) =>
        setTimeout(
          r,
          ms,
        ),
    ),
  log = console.log,
}) {
  // The version names an immutable path that old tabs keep running, so it must be what the boot files
  // hash to, not whatever the manifest claims (a hand-edited or stale manifest must not publish
  // different bytes under another version's path).
  const actual =
    bootVersion(
      dir,
    );
  if (
    actual !==
    manifest.version
  ) {
    throw new Error(
      `manifest.json says version ${manifest.version} but the boot files in ${dir} hash to ${actual}; ` +
        'refusing to publish (rebuild the manifest with write-manifest.mjs)',
    );
  }
  const prefix = `rmhos/${manifest.version}/`;
  if (
    !force
  ) {
    let exists = true;
    try {
      await client.send(
        new HeadObjectCommand(
          {
            Bucket:
              bucket,
            Key: `${prefix}manifest.json`,
          },
        ),
      );
    } catch (e) {
      if (
        !notFound(
          e,
        )
      )
        throw e;
      exists = false;
    }
    if (
      exists
    ) {
      throw new Error(
        `${prefix}manifest.json already exists: a published version is immutable and old tabs run it. ` +
          'Refusing to overwrite (re-run with --force only to repair a half-published copy of the same bytes).',
      );
    }
  }

  const uploaded =
    [];
  const put =
    async (
      name,
      body,
    ) => {
      const key = `${prefix}${name}`;
      let last;
      for (
        let attempt = 1;
        attempt <=
        attempts;
        attempt++
      ) {
        try {
          await client.send(
            new PutObjectCommand(
              {
                Bucket:
                  bucket,
                Key: key,
                Body: body,
                ContentType:
                  contentTypeFor(
                    name,
                  ),
                CacheControl:
                  CACHE_CONTROL,
              },
            ),
          );
          uploaded.push(
            key,
          );
          log(
            `uploaded ${key}`,
          );
          return;
        } catch (e) {
          last =
            e;
          log(
            `attempt ${attempt}/${attempts} for ${key} failed: ${e instanceof Error ? e.message : e}`,
          );
          if (
            attempt <
            attempts
          )
            await sleep(
              1000 *
                2 **
                  (attempt -
                    1),
            );
        }
      }
      throw new Error(
        `giving up on ${key} after ${attempts} attempts: ${last instanceof Error ? last.message : last}`,
      );
    };

  for (const [
    name,
    info,
  ] of Object.entries(
    manifest.files,
  )) {
    const body =
      await readFile(
        path.join(
          dir,
          name,
        ),
      );
    const sha256 =
      createHash(
        'sha256',
      )
        .update(
          body,
        )
        .digest(
          'hex',
        );
    if (
      body.length !==
        info.size ||
      sha256 !==
        info.sha256
    ) {
      throw new Error(
        `${name} does not match manifest.json (size or sha256); rebuild the manifest`,
      );
    }
    await put(
      name,
      body,
    );
  }
  // Last: its presence means every file above is in place.
  await put(
    'manifest.json',
    await readFile(
      path.join(
        dir,
        'manifest.json',
      ),
    ),
  );
  return uploaded;
}

const clean =
  (
    v,
  ) =>
    v ==
    null
      ? v
      : v
          .trim()
          .replace(
            /^(['"])([\s\S]*)\1$/,
            '$2',
          );

async function main() {
  const args =
    process.argv.slice(
      2,
    );
  const force =
    args.includes(
      '--force',
    );
  const dirArg =
    args.find(
      (
        a,
      ) =>
        !a.startsWith(
          '--',
        ),
    );

  let endpoint =
    clean(
      process
        .env
        .S3_ENDPOINT,
    );
  if (
    endpoint
  ) {
    try {
      endpoint =
        new URL(
          endpoint,
        )
          .origin;
    } catch {
      /* malformed: leave it so the SDK throws a clear error */
    }
  }
  const accessKeyId =
    clean(
      process
        .env
        .S3_ACCESS_KEY_ID,
    );
  const secretAccessKey =
    clean(
      process
        .env
        .S3_SECRET_ACCESS_KEY,
    );
  const bucket =
    clean(
      process
        .env
        .S3_BUCKET,
    );
  const region =
    clean(
      process
        .env
        .S3_REGION,
    ) ||
    'auto';
  const forcePathStyle =
    clean(
      process
        .env
        .S3_FORCE_PATH_STYLE,
    );
  if (
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket
  ) {
    console.error(
      'publish-r2: need S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET',
    );
    process.exit(
      1,
    );
  }

  const dir =
    path.resolve(
      dirArg ??
        'public/rmhos-dev',
    );
  requireMeta(
    dir,
    'publish-r2',
  );
  const manifest =
    JSON.parse(
      readFileSync(
        path.join(
          dir,
          'manifest.json',
        ),
        'utf8',
      ),
    );
  if (
    !/^[0-9a-f]{12}$/.test(
      manifest.version ??
        '',
    )
  ) {
    console.error(
      'publish-r2: manifest.json has no valid version',
    );
    process.exit(
      1,
    );
  }

  const client =
    new S3Client(
      {
        endpoint,
        region,
        forcePathStyle:
          forcePathStyle
            ? forcePathStyle !==
              'false'
            : false,
        credentials:
          {
            accessKeyId,
            secretAccessKey,
          },
      },
    );
  try {
    await publish(
      {
        client,
        bucket,
        dir,
        manifest,
        force,
      },
    );
  } catch (e) {
    console.error(
      `publish-r2: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(
      1,
    );
  }
  console.log(
    pinReport(
      manifest,
    ),
  );
}

if (
  process
    .argv[1] &&
  import.meta
    .url ===
    pathToFileURL(
      process
        .argv[1],
    )
      .href
)
  await main();
