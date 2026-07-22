/** Inputs used by the one-shot client performance tier decision. */
export interface PerformanceTierSignals {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  iosWebKit: boolean;
}

/**
 * Whether to apply the reduced-cost glass tier.
 *
 * iOS WebKit has a dedicated safe CSS tier, so its commonly reported six-core
 * value must not erase the liquid-glass material on otherwise capable iPhones.
 * An explicit Data Saver request remains authoritative on every platform.
 */
export function shouldUsePerfLite(signals: PerformanceTierSignals): boolean {
  if (signals.saveData) return true;
  if (signals.iosWebKit) return false;
  return (signals.deviceMemory ?? 8) <= 6 || (signals.hardwareConcurrency ?? 8) <= 6;
}
