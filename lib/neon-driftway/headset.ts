/**
 * "Is this being played through a headset?"
 *
 * Used only to pick a *default* view mode — the player can always override it.
 * Getting this wrong in the safe direction matters more than getting it right:
 * showing a split-screen view to someone holding a bare phone is a broken
 * screen, while showing a single view inside a headset is merely a flat one.
 * So detection is deliberately conservative and defaults to "no".
 *
 * Two signals, in order of trust:
 *
 *  1. **WebXR.** `navigator.xr.isSessionSupported('immersive-vr')` is the only
 *     real answer — it is true when an XR runtime with a display is actually
 *     present. It is also a permission-free query, so it is safe on load.
 *  2. **Known headset browsers.** Standalone headsets ship browsers that
 *     identify themselves, and some of them gate WebXR behind a flag. This is
 *     a user-agent sniff and is treated as the weaker signal it is.
 */

/** Browsers that only ship on a headset. Ordinary phones never match. */
const HEADSET_UA = /\b(OculusBrowser|Quest|Pico(?:Browser|VR)?|VIVE|Wolvic|MagicLeap)\b/i;

interface XRNavigator {
  xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
}

/** True where a headset browser identifies itself in the user agent. */
export function isHeadsetUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return HEADSET_UA.test(navigator.userAgent);
}

/** True where the browser exposes WebXR at all (says nothing about hardware). */
export function hasWebXr(): boolean {
  return typeof navigator !== 'undefined' && 'xr' in navigator;
}

/**
 * Whether to default this device to the split-screen view.
 *
 * Never throws and never prompts; resolves to `false` on anything unexpected.
 */
export async function detectHeadset(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (isHeadsetUserAgent()) return true;

  const xr = (navigator as XRNavigator).xr;
  if (!xr?.isSessionSupported) return false;
  try {
    return await xr.isSessionSupported('immersive-vr');
  } catch {
    // Some browsers reject rather than resolve false when XR is disabled.
    return false;
  }
}
