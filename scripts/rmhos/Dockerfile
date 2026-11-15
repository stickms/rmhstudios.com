# syntax=docker/dockerfile:1
# rmhOS image build: kernel, root filesystem and BIOS files, from pinned
# upstream sources. Driven by build.sh, which passes the versions.env values.
ARG ALPINE_VERSION=3.22

# ---------------------------------------------------------------- base
# Pinned by digest (the tag is for reading); bump both together with versions.env.
FROM i386/alpine:${ALPINE_VERSION}@sha256:a5a75741b67fad64c3492d6fec1228024d7b376278041b857787ce16914040d9 AS base
# Optional extra CA (a TLS-inspecting proxy), copied in by build.sh. It is
# trusted for the build only and never reaches the output files.
COPY .build-ca/ /tmp/extra-ca/
RUN set -eu; \
    cat /tmp/extra-ca/*.crt >> /etc/ssl/certs/ca-certificates.crt 2>/dev/null || true; \
    apk add --no-cache ca-certificates; \
    mkdir -p /usr/local/share/ca-certificates; \
    for f in /tmp/extra-ca/*.crt; do \
        if [ -e "$f" ]; then cp "$f" /usr/local/share/ca-certificates/; fi; \
    done; \
    update-ca-certificates; \
    rm -rf /tmp/extra-ca

# -------------------------------------------------------------- kernel
FROM base AS kernel
RUN apk add --no-cache build-base bc bison flex perl elfutils-dev openssl-dev \
        linux-headers e2fsprogs curl patch xz diffutils findutils
ARG KERNEL_URL
ARG KERNEL_SHA256
RUN set -eu; \
    curl -fsSL --retry 3 -o /tmp/linux.tar.xz "$KERNEL_URL"; \
    echo "$KERNEL_SHA256  /tmp/linux.tar.xz" | sha256sum -c -; \
    mkdir /src; \
    tar -xJf /tmp/linux.tar.xz -C /src --strip-components=1; \
    rm /tmp/linux.tar.xz
COPY patches/ /patches/
RUN set -eu; cd /src; \
    for p in /patches/*.patch; do echo "patch $p"; patch -p1 < "$p"; done
COPY kernel.config verify-config.sh /
RUN set -eu; cd /src; \
    make ARCH=i386 tinyconfig; \
    ARCH=i386 scripts/kconfig/merge_config.sh -m .config /kernel.config; \
    make ARCH=i386 olddefconfig; \
    sh /verify-config.sh .config /kernel.config
ENV KBUILD_BUILD_USER=rmhos KBUILD_BUILD_HOST=rmhos \
    KBUILD_BUILD_TIMESTAMP="Thu Jan  1 00:00:00 UTC 1970"
RUN set -eu; cd /src; \
    make ARCH=i386 -j"$(nproc)" bzImage; \
    mkdir /out; cp arch/x86/boot/bzImage /out/bzImage; \
    make -s ARCH=i386 kernelrelease > /out/kernelrelease; \
    ls -l /out

# ---------------------------------------------------------------- bios
FROM base AS bios
RUN apk add --no-cache seabios-bin seavgabios-bin
RUN set -eu; mkdir /out; \
    ls -l /usr/share/seabios; \
    cp /usr/share/seabios/bios.bin /out/seabios.bin; \
    ls -l /usr/share/seavgabios; \
    cp /usr/share/seavgabios/vgabios-stdvga.bin /out/vgabios.bin; \
    apk info -v seabios-bin seavgabios-bin | sort > /out/bios-packages.txt

# -------------------------------------------------------------- rootfs
FROM base AS rootfs
RUN apk add --no-cache e2fsprogs curl tar
ARG ALPINE_VERSION
ARG ALPINE_ARCH
ARG ALPINE_MINIROOTFS_VERSION
ARG ALPINE_MINIROOTFS_SHA256
RUN set -eu; \
    f=alpine-minirootfs-${ALPINE_MINIROOTFS_VERSION}-${ALPINE_ARCH}.tar.gz; \
    curl -fsSL --retry 3 -o /tmp/mini.tgz \
        "https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}/releases/${ALPINE_ARCH}/$f"; \
    echo "$ALPINE_MINIROOTFS_SHA256  /tmp/mini.tgz" | sha256sum -c -; \
    mkdir /rootfs; tar -xzf /tmp/mini.tgz -C /rootfs; rm /tmp/mini.tgz
COPY packages.list /tmp/packages.list
RUN set -eu; \
    pkgs=$(grep -v '^#' /tmp/packages.list | tr '\n' ' '); \
    apk --root /rootfs --no-cache add $pkgs; \
    rm -rf /rootfs/var/cache/apk/*
COPY rootfs/ /rootfs/
# Boot wiring that is not a plain file: services, locked root, mount points,
# and checks that the busybox applets the agent needs exist. xorg-server drags
# in Mesa's software GL (libgallium + LLVM, ~340 MB); the fbdev X server never
# draws through it (GLX is disabled in xorg.conf.d), so those files are removed
# to keep the image under budget. packages.txt notes this.
RUN set -eu; cd /rootfs; \
    rc() { chroot /rootfs /sbin/rc-update -q add "$@"; }; \
    for s in devfs dmesg udev udev-trigger; do rc "$s" sysinit; done; \
    for s in hostname bootmisc sysctl localmount seedrng swclock; do \
        if [ -e etc/init.d/$s ]; then rc "$s" boot; else echo "no init script: $s"; fi; \
    done; \
    for s in rmhos-agent networking local; do rc "$s" default; done; \
    for s in mount-ro killprocs savecache; do \
        if [ -e etc/init.d/$s ]; then rc "$s" shutdown; fi; \
    done; \
    chroot /rootfs /bin/sh -c 'passwd -l root >/dev/null'; \
    rm -f usr/lib/libLLVM* usr/lib/libgallium-*.so; \
    rm -rf usr/lib/gallium-pipe usr/share/doc usr/share/man usr/share/info; \
    mkdir -p mnt/host home; \
    ls -l usr/libexec/Xorg* usr/bin/Xorg 2>/dev/null || true; \
    ls etc/runlevels/*; \
    for b in openvt stty su tar adduser addgroup deluser; do \
        chroot /rootfs /bin/busybox --list | grep -qx "$b" || { echo "busybox lacks $b" >&2; exit 1; }; \
    done; \
    mkdir -p /tmp/t/a /tmp/t/o && echo x > /tmp/t/a/f && tar -cf /tmp/t/t.tar -C /tmp/t a && \
        chroot /rootfs /bin/tar -xpf - -C /home --no-same-owner < /tmp/t/t.tar && \
        rm -rf /rootfs/home/a /tmp/t || { echo "tar lacks --no-same-owner" >&2; exit 1; }; \
    chroot /rootfs /bin/sh -n /usr/local/bin/rmhos-agent
RUN set -eu; \
    apk --root /rootfs info -v | sort > /packages.txt; \
    wc -l /packages.txt; \
    used_kb=$(du -sk /rootfs | cut -f1); \
    files=$(find /rootfs | wc -l); \
    size_mb=$(( used_kb / 1024 + used_kb / 1024 / 10 + 96 )); \
    echo "rootfs: ${used_kb} KB in ${files} files -> ${size_mb} MB image"; \
    mkdir /out; \
    mke2fs -q -t ext4 -O ^has_journal -m 0 -L rmhos -N $(( files * 2 + 20000 )) \
        -U 5a1e5d5e-7a11-4a11-8a11-726d68306f73 \
        -E hash_seed=5a1e5d5e-7a11-4a11-8a11-726d68306f73,root_owner=0:0 \
        -d /rootfs /out/rootfs.ext4 ${size_mb}M; \
    e2fsck -fn /out/rootfs.ext4; \
    cp /packages.txt /out/packages.txt

# -------------------------------------------------------------- export
FROM scratch AS export
COPY --from=kernel /out/bzImage /out/kernelrelease /
COPY --from=bios /out/seabios.bin /out/vgabios.bin /out/bios-packages.txt /
COPY --from=rootfs /out/rootfs.ext4 /out/packages.txt /
