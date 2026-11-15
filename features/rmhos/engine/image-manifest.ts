/**
 * The published rmhOS image this build of the site boots, pinned by version.
 *
 * `scripts/rmhos/write-manifest.mjs` writes `manifest.json` next to the built
 * files; its values are copied here when a new image is published (the version
 * is a hash of the boot inputs, so a new image is a new path and an old page
 * never mixes files from two builds: a saved state only restores onto the
 * rootfs it was taken with).
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

export const PINNED_IMAGE: {
  version: string;
  files: Record<'bzImage' | 'rootfs' | 'state' | 'seabios' | 'vgabios', Pin>;
} = {
  version: 'a9b457f5bc90',
  files: {
    bzImage: {
      size: 1946112,
      sha256: '72ad548512bc9df8af6135cf5855ea66c4859eae926fe577aebbd3533db61367',
    },
    rootfs: {
      size: 288358400,
      sha256: '3c0f27a20bb9369a97e3e45117e29238e94007f76c2052b55503d396f632cbcf',
    },
    state: {
      size: 7257216,
      sha256: 'cb7e5edc37146b68b6ba72cb23db461a3e772e7d4375abf35c435775517f8109',
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

/** `https://cdn.example/rmhos/<version>/<file>` with a CDN base, `/rmhos-dev/<file>` without. */
export function resolveImageManifest(cdnBase: string | undefined): ImageManifest {
  const base = cdnBase
    ? `${cdnBase.replace(/\/+$/, '')}/rmhos/${PINNED_IMAGE.version}/`
    : '/rmhos-dev/';
  const file = (k: keyof typeof FILE_NAMES): ImageFile => ({
    url: `${base}${FILE_NAMES[k]}`,
    ...PINNED_IMAGE.files[k],
  });
  return {
    version: PINNED_IMAGE.version,
    bzImage: file('bzImage'),
    rootfs: file('rootfs'),
    state: file('state'),
    seabios: file('seabios'),
    vgabios: file('vgabios'),
  };
}
