/**
 * The machine, built from the single definition the snapshot was taken with
 * (`scripts/rmhos/vm-options.mjs`: pure data, no Node imports, so it bundles
 * for the browser as is). A v86 state only restores into the same memory size,
 * device set and kernel command line, so the page must not re-type any of it.
 */
import { baseVmOptions } from '../../../scripts/rmhos/vm-options.mjs';

export interface VmOptionsInput {
  /** Directory URL of bzImage, rootfs.ext4 and the BIOS files, ending in a slash. */
  baseUrl: string;
  relayUrl: string;
}

export function vmOptions({ baseUrl, relayUrl }: VmOptionsInput) {
  return baseVmOptions({ baseUrl, relayUrl }) as ReturnType<typeof baseVmOptions> & {
    cmdline: string;
    memory_size: number;
    vga_memory_size: number;
    hda: { url: string; async: boolean };
    net_device: { type: string; relay_url: string };
    preserve_mac_from_state_image: boolean;
  };
}
