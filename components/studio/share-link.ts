/** Browser-side helpers for a share link: the address a token lives at, and copying it. */

/** The address that opens a share: the Studio with `?share=<token>`. */
export function shareUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/studio?share=${token}`;
}

/** Write text to the clipboard. False when the browser refuses; never throws. */
export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
