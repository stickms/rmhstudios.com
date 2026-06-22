/**
 * CDN purge abstraction. Deleting an S3 origin object does not evict CDN edge
 * caches, so cleanup must explicitly purge. This is a no-op until a CDN is
 * configured (CDN_PURGE_URL + CDN_PURGE_TOKEN), keeping callers CDN-agnostic.
 * Best-effort: a purge failure must never abort a sweep, so errors are logged
 * and swallowed (a short Cache-Control TTL is the safety net).
 */
export function cdnConfigured(): boolean {
  return Boolean(process.env.CDN_PURGE_URL && process.env.CDN_PURGE_TOKEN);
}

export async function purgeFromCdn(key: string): Promise<void> {
  if (!cdnConfigured()) return;
  try {
    await fetch(process.env.CDN_PURGE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CDN_PURGE_TOKEN!}`,
      },
      body: JSON.stringify({ key }),
    });
  } catch (err) {
    console.error("[cdn] purge failed for", key, err);
  }
}
