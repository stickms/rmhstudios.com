/**
 * The facts the About dialog states, from features/rmhos/NOTICE.md (the licence record) and the
 * pinned image manifest. A test keeps them equal to NOTICE.md, so the dialog cannot drift from it.
 */
import type { ImageManifest } from '../engine/image-manifest';

export const KERNEL_VERSION = '6.12.117';
export const KERNEL_TARBALL_URL = `https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-${KERNEL_VERSION}.tar.xz`;
export const SOURCE_REPO_URL = 'https://github.com/stickms/rmhstudios.com';
export const BUILD_SCRIPTS_URL = `${SOURCE_REPO_URL}/tree/main/scripts/rmhos`;
export const V86_URL = 'https://github.com/copy/v86';

/** packages.txt is published beside the image: same directory as the root filesystem. */
export function packagesUrl(manifest: ImageManifest): string {
  return `${manifest.rootfs.url.slice(0, manifest.rootfs.url.lastIndexOf('/') + 1)}packages.txt`;
}
