#!/usr/bin/env bash
# Reproducible rmhOS image build: kernel, root filesystem, BIOS files.
#
#   pnpm rmhos:image            # writes public/rmhos-dev/
#
# Environment (all optional):
#   RMHOS_OUT_DIR           output directory (default <repo>/public/rmhos-dev)
#   HTTPS_PROXY/HTTP_PROXY  passed into the build; with a loopback proxy the
#                           build also runs on the host network
#   RMHOS_BUILD_CA_BUNDLE   a PEM file installed as an extra trusted CA inside
#                           the build (for a TLS-inspecting proxy). It is copied
#                           to a git-ignored folder and never ships.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
# shellcheck source=versions.env
. "$here/versions.env"

out=${RMHOS_OUT_DIR:-$root/public/rmhos-dev}
max_kernel=$((12 * 1024 * 1024))
max_rootfs=$((400 * 1024 * 1024))
kernel_major=${KERNEL_SERIES%%.*}
kernel_url="https://cdn.kernel.org/pub/linux/kernel/v${kernel_major}.x/linux-${KERNEL_VERSION}.tar.xz"

command -v docker >/dev/null || { echo "build.sh: docker is required" >&2; exit 1; }

# Extra CA for the build context (git-ignored, removed on exit).
ca_dir=$here/.build-ca
rm -rf "$ca_dir"
mkdir -p "$ca_dir"
if [ -n "${RMHOS_BUILD_CA_BUNDLE:-}" ]; then
  [ -f "$RMHOS_BUILD_CA_BUNDLE" ] || { echo "build.sh: RMHOS_BUILD_CA_BUNDLE is not a file" >&2; exit 1; }
  cp "$RMHOS_BUILD_CA_BUNDLE" "$ca_dir/extra-ca.crt"
fi

args=(
  --build-arg "ALPINE_VERSION=$ALPINE_VERSION"
  --build-arg "ALPINE_ARCH=$ALPINE_ARCH"
  --build-arg "ALPINE_MINIROOTFS_VERSION=$ALPINE_MINIROOTFS_VERSION"
  --build-arg "ALPINE_MINIROOTFS_SHA256=$ALPINE_MINIROOTFS_SHA256"
  --build-arg "KERNEL_URL=$kernel_url"
  --build-arg "KERNEL_SHA256=$KERNEL_SHA256"
)
for v in HTTPS_PROXY HTTP_PROXY NO_PROXY; do
  if [ -n "${!v:-}" ]; then args+=(--build-arg "$v=${!v}"); fi
done
case "${HTTPS_PROXY:-}" in
  *127.0.0.1* | *localhost*) args+=(--network host) ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp" "$ca_dir"' EXIT

echo "build.sh: building rmhOS image (kernel ${KERNEL_VERSION}, Alpine ${ALPINE_VERSION} ${ALPINE_ARCH})"
DOCKER_BUILDKIT=1 docker build --platform linux/386 "${args[@]}" --target export --output "type=local,dest=$tmp" "$here"

for f in bzImage rootfs.ext4 seabios.bin vgabios.bin packages.txt bios-packages.txt kernelrelease; do
  [ -s "$tmp/$f" ] || { echo "build.sh: build produced no $f" >&2; exit 1; }
done

size() { stat -c %s "$1"; }
ksize=$(size "$tmp/bzImage")
rsize=$(size "$tmp/rootfs.ext4")
[ "$ksize" -le "$max_kernel" ] || { echo "build.sh: bzImage is $ksize bytes, budget $max_kernel" >&2; exit 1; }
[ "$rsize" -le "$max_rootfs" ] || { echo "build.sh: rootfs.ext4 is $rsize bytes, budget $max_rootfs" >&2; exit 1; }
case "$(cat "$tmp/kernelrelease")" in
  *-rmhos) ;;
  *) echo "build.sh: kernel release '$(cat "$tmp/kernelrelease")' does not end in -rmhos" >&2; exit 1 ;;
esac

mkdir -p "$out"
for f in bzImage rootfs.ext4 seabios.bin vgabios.bin; do
  cp "$tmp/$f" "$out/$f"
done
{
  echo "# rmhOS image contents: Alpine ${ALPINE_VERSION} (${ALPINE_ARCH}) packages, then the BIOS packages."
  echo "# Removed from the image to fit its size budget: Mesa software GL (libgallium, LLVM); the fbdev X server does not use them."
  echo "# Kernel: Linux ${KERNEL_VERSION} (GPL-2.0), source ${kernel_url}"
  cat "$tmp/packages.txt"
  cat "$tmp/bios-packages.txt"
} > "$out/packages.txt"

node "$here/manifest.mjs" "$out" "$KERNEL_VERSION" "$kernel_url" "$KERNEL_SHA256"
ls -l "$out"
