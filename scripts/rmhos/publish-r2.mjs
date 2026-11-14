/* eslint-disable no-console -- command-line tool output */
// Uploads an rmhOS image directory to the public R2 bucket under
// rmhos/<version>/<file> with an immutable Cache-Control, using the same S3_*
// credentials and AWS SDK client as scripts/sync-static-assets-to-r2.mjs, then
// prints the manifest for pasting into features/rmhos/image-manifest.ts.
//
//   S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET=... \
//     node scripts/rmhos/publish-r2.mjs [dir]        (default public/rmhos-dev)
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createReadStream,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

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
    process
      .argv[2] ??
      'public/rmhos-dev',
  );
const manifestPath =
  path.join(
    dir,
    'manifest.json',
  );
const manifest =
  JSON.parse(
    readFileSync(
      manifestPath,
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

const CACHE_CONTROL =
  'public, max-age=31536000, immutable';
const TYPES =
  {
    '.json':
      'application/json',
    '.txt':
      'text/plain; charset=utf-8',
    '.zst':
      'application/zstd',
  };

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

const names =
  [
    ...Object.keys(
      manifest.files,
    ),
    'manifest.json',
  ];
for (const name of names) {
  const file =
    path.join(
      dir,
      name,
    );
  const key = `rmhos/${manifest.version}/${name}`;
  await client.send(
    new PutObjectCommand(
      {
        Bucket:
          bucket,
        Key: key,
        Body: createReadStream(
          file,
        ),
        ContentLength:
          statSync(
            file,
          )
            .size,
        CacheControl:
          CACHE_CONTROL,
        ContentType:
          TYPES[
            path.extname(
              name,
            )
          ] ??
          'application/octet-stream',
      },
    ),
  );
  console.log(
    `uploaded ${key}`,
  );
}

console.log(
  '\nManifest for features/rmhos/image-manifest.ts:\n',
);
console.log(
  JSON.stringify(
    manifest,
    null,
    2,
  ),
);
