// The one definition of the rmhOS virtual machine. The snapshot (snapshot.mjs),
// the smoke test and the browser page (Task 7, which mirrors these values in
// TypeScript) all build the machine from here: a v86 state only restores into
// the same memory size, device set and kernel command line.
//
// `baseUrl` is where bzImage, rootfs.ext4, seabios.bin and vgabios.bin are
// served from, ending in a slash (an https URL in the browser, a directory path
// in Node: v86 reads either). Environment-specific options (screen container,
// wasm path, speaker, serial adapters) are the caller's.

export const MEMORY_BYTES = 640 * 1024 * 1024;
export const VGA_MEMORY_BYTES = 8 * 1024 * 1024;
export const CMDLINE =
  'root=/dev/sda rw rootfstype=ext4 console=ttyS0 console=tty0 vga=0x318 quiet tsc=reliable mitigations=off';

/** What the snapshot is taken with. A restored machine may use a different relay URL. */
export const PLACEHOLDER_RELAY_URL = 'wisp://127.0.0.1:1/';

export function baseVmOptions({ baseUrl, relayUrl = PLACEHOLDER_RELAY_URL }) {
  return {
    memory_size: MEMORY_BYTES,
    vga_memory_size: VGA_MEMORY_BYTES,
    bios: {
      url: `${baseUrl}seabios.bin`,
    },
    vga_bios: {
      url: `${baseUrl}vgabios.bin`,
    },
    bzimage: {
      url: `${baseUrl}bzImage`,
    },
    // Ranged reads: only the blocks the guest touches are fetched, and a saved
    // state holds only the blocks it wrote (a whole-buffer disk would put the
    // entire 270 MB image into the state).
    hda: {
      url: `${baseUrl}rootfs.ext4`,
      async: true,
    },
    cmdline: CMDLINE,
    filesystem: {},
    uart1: true,
    net_device: {
      type: 'virtio',
      relay_url: relayUrl,
    },
    // A restored guest keeps the MAC it had when the state was saved.
    preserve_mac_from_state_image: true,
  };
}
