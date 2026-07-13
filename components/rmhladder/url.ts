export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sourceDomain(value: unknown): string {
  const safeUrl = safeExternalUrl(value);
  if (!safeUrl) return 'company site';
  return new URL(safeUrl).hostname.replace(/^www\./, '');
}

/** Record the outbound click without delaying or replacing normal navigation. */
export function trackApplyClick(jobId: string, destination: string) {
  if (typeof navigator === 'undefined') return;
  const body = JSON.stringify({
    type: 'apply_click',
    jobId,
    metadata: { sourceDomain: sourceDomain(destination) },
  });
  const sent = typeof navigator.sendBeacon === 'function'
    ? navigator.sendBeacon('/api/rmhladder/events', new Blob([body], { type: 'application/json' }))
    : false;
  if (!sent) {
    void fetch('/api/rmhladder/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }
}
