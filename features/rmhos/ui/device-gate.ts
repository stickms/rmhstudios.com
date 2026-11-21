/**
 * Whether to ask before downloading and starting the machine. rmhOS wants a keyboard and about
 * 640 MB of memory for the guest plus the page's own copies of the home folder when it saves.
 * The test is by capability, not by width: a coarse pointer (touch is the primary input) on a
 * narrow screen, or on any screen when the browser does not report at least 8 GB of device memory
 * (`navigator.deviceMemory` is capped and coarsened by browsers, and absent in Safari and Firefox,
 * which is where an iPad lands). A warning, never a block: "Start anyway" is always there.
 */
export interface DeviceFacts {
  /** `matchMedia('(pointer: coarse)').matches` */
  coarsePointer: boolean;
  innerWidth: number;
  /** `navigator.deviceMemory` in GB, or undefined when the browser does not say. */
  deviceMemory: number | undefined;
}

export interface DeviceGate {
  /** Ask before starting. */
  warn: boolean;
  /** The memory may be short (4 GB or less, or not reported): say so too. */
  lowMemory: boolean;
}

export function deviceGate(f: DeviceFacts): DeviceGate {
  if (!f.coarsePointer)
    return {
      warn: false,
      lowMemory: false,
    };
  const lowMemory = f.deviceMemory === undefined || f.deviceMemory <= 4;
  return {
    warn: f.innerWidth < 768 || lowMemory,
    lowMemory,
  };
}

export function readDeviceFacts(): DeviceFacts {
  const mem = (
    navigator as {
      deviceMemory?: number;
    }
  ).deviceMemory;
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    innerWidth: window.innerWidth,
    deviceMemory: typeof mem === 'number' ? mem : undefined,
  };
}
