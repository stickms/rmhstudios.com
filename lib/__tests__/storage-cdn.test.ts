import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  delete process.env.CDN_PURGE_URL;
  delete process.env.CDN_PURGE_TOKEN;
  vi.unstubAllGlobals();
});

describe("purgeFromCdn", () => {
  it("is a no-op and does not fetch when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { cdnConfigured, purgeFromCdn } = await import("@/lib/storage/cdn.server");
    expect(cdnConfigured()).toBe(false);
    await purgeFromCdn("rmharks/a.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the key with a bearer token when configured", async () => {
    process.env.CDN_PURGE_URL = "https://cdn.example/purge";
    process.env.CDN_PURGE_TOKEN = "secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { cdnConfigured, purgeFromCdn } = await import("@/lib/storage/cdn.server");
    expect(cdnConfigured()).toBe(true);
    await purgeFromCdn("rmharks/a.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cdn.example/purge");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual({ key: "rmharks/a.png" });
  });

  it("swallows fetch errors (best-effort)", async () => {
    process.env.CDN_PURGE_URL = "https://cdn.example/purge";
    process.env.CDN_PURGE_TOKEN = "secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { purgeFromCdn } = await import("@/lib/storage/cdn.server");
    await expect(purgeFromCdn("rmharks/a.png")).resolves.toBeUndefined();
  });
});
