/**
 * The rmhOS image this build of the site boots, pinned by version.
 *
 * `scripts/rmhos/write-manifest.mjs` writes `manifest.json` next to the built
 * files; its values are copied into `PUBLISHED_IMAGE` when a new image is
 * published (the version is a hash of the boot inputs, so a new image is a new
 * path and an old page never mixes files from two builds: a saved state only
 * restores onto the rootfs it was taken with).
 *
 * With a CDN base the page boots `PUBLISHED_IMAGE`, and while that is `null`
 * nothing has been published: `resolveImageManifest` returns `null` and the
 * page shows "coming soon" without fetching anything. Without a CDN base (dev)
 * it boots `DEV_IMAGE` from `/rmhos-dev/`.
 */
export interface ImageFile {
  url: string;
  size: number;
  sha256: string;
}

export interface ImageManifest {
  version: string;
  bzImage: ImageFile;
  rootfs: ImageFile;
  state: ImageFile | null;
  seabios: ImageFile;
  vgabios: ImageFile;
}

type Pin = Omit<ImageFile, 'url'>;

export interface PinnedImage {
  version: string;
  files: Record<'bzImage' | 'rootfs' | 'state' | 'seabios' | 'vgabios', Pin>;
}

/**
 * The published image, or `null` while none is published. This is the one thing the owner sets
 * when they publish. Checklist, all in the same commit:
 *  1. Run the `rmhos-image` workflow (`.github/workflows/rmhos-image.yml`).
 *  2. Paste the values it prints (version, size and sha256 of each file) here, in place of `null`.
 *  3. Set `status: 'Beta'` in `features/rmhos/catalog.ts` (publish-state.test.ts fails if the two
 *     disagree).
 *  4. Run `pnpm exec vitest run lib/__tests__/catalog-contract.test.ts -u` and `pnpm docs:site`.
 *  5. See `docs/rmhos.md` ("Publish a new image version").
 */
export const PUBLISHED_IMAGE: PinnedImage | null = null;

/** A sandbox build served from `public/rmhos-dev/` (its `manifest.json` must match). Dev only. */
export const DEV_IMAGE: PinnedImage = {
  version: 'a58b09f01b89',
  files: {
    bzImage: {
      size: 1946112,
      sha256: '72ad548512bc9df8af6135cf5855ea66c4859eae926fe577aebbd3533db61367',
    },
    rootfs: {
      size: 288358400,
      sha256: '15b90da2f8253cc20e29117b2c7017fd1fd7e99fb776fb7836c1a5f01eb7e81f',
    },
    state: {
      size: 7262028,
      sha256: '985fa0daea54035c9e01a7d456bf931f87aed8b15117e91bdf1d514b2a0ba98f',
    },
    seabios: {
      size: 131072,
      sha256: '9dc0e3a5ffc57f7377f645ff365edce8389f21a96f24322797c14d557e9350e3',
    },
    vgabios: {
      size: 39424,
      sha256: '2dfbbf5d577581c16fec1070058c8fb2b69ecf0c9e147d11db5561aa0437d048',
    },
  },
};

const FILE_NAMES = {
  bzImage: 'bzImage',
  rootfs: 'rootfs.ext4',
  state: 'state.zst',
  seabios: 'seabios.bin',
  vgabios: 'vgabios.bin',
} as const;

/**
 * `https://cdn.example/rmhos/<version>/<file>` with a CDN base, `/rmhos-dev/<file>` without.
 * `null` when a CDN base is set and no image has been published (`published` is a parameter so
 * tests can try a published image without editing `PUBLISHED_IMAGE`).
 */
export function resolveImageManifest(
  cdnBase: string | undefined,
  published: PinnedImage | null = PUBLISHED_IMAGE,
): ImageManifest | null {
  const pin = cdnBase ? published : DEV_IMAGE;
  if (!pin) return null;
  const base = cdnBase ? `${cdnBase.replace(/\/+$/, '')}/rmhos/${pin.version}/` : '/rmhos-dev/';
  const file = (k: keyof typeof FILE_NAMES): ImageFile => ({
    url: `${base}${FILE_NAMES[k]}`,
    ...pin.files[k],
  });
  return {
    version: pin.version,
    bzImage: file('bzImage'),
    rootfs: file('rootfs'),
    state: file('state'),
    seabios: file('seabios'),
    vgabios: file('vgabios'),
  };
}
