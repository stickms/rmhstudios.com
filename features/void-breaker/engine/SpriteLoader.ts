/**
 * SpriteLoader.ts — Image caching and preload APIs for Void Breaker.
 * SSR-safe: only runs in browser (checks typeof window).
 * Logs missing assets once (not per frame).
 */

const cache = new Map<string, HTMLImageElement>();
const failedUrls = new Set<string>();
const loading = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load a single image and cache it.
 * Returns a cached image immediately if already loaded.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
    if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));

    const cached = cache.get(url);
    if (cached) return Promise.resolve(cached);

    const pending = loading.get(url);
    if (pending) return pending;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            cache.set(url, img);
            loading.delete(url);
            resolve(img);
        };
        img.onerror = () => {
            if (!failedUrls.has(url)) {
                failedUrls.add(url);
                console.warn(`[SpriteLoader] Failed to load: ${url}`);
            }
            loading.delete(url);
            reject(new Error(`Failed to load image: ${url}`));
        };
        img.src = url;
    });

    loading.set(url, promise);
    return promise;
}

/**
 * Preload an array of image URLs.
 * Silently ignores failures (fallback rendering will be used).
 */
export async function preloadAll(urls: string[]): Promise<void> {
    if (typeof window === 'undefined') return;
    await Promise.allSettled(urls.map(loadImage));
}

/**
 * Get a cached image synchronously. Returns undefined if not yet loaded.
 * This is the primary way the render loop accesses sprites (non-blocking).
 */
export function getCachedImage(url: string): HTMLImageElement | undefined {
    return cache.get(url);
}

/**
 * Check if a URL has failed to load (for fallback rendering).
 */
export function hasFailed(url: string): boolean {
    return failedUrls.has(url);
}

/**
 * Dev-only: clear all caches.
 */
export function clearCache(): void {
    cache.clear();
    failedUrls.clear();
    loading.clear();
}

/**
 * Get list of all URLs that failed to load (for debug overlay).
 */
export function getFailedUrls(): string[] {
    return Array.from(failedUrls);
}
