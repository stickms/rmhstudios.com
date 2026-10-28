/** Read particle bundles and textures published by scripts/tf2-assets/particles.py. */
import { brotliDecompressSync } from 'node:zlib';
import { getObjectEncoded } from '@/lib/storage/s3.server';
import { isSafeParticlePath } from './particles/types';

export async function readParticleFile(path: string, acceptEncoding = '') {
  if (!isSafeParticlePath(path)) return null;
  const stored = await getObjectEncoded('tf2-particles/' + path);
  if (!stored) return null;
  const contentType = path.endsWith('.json') ? 'application/json' : 'image/webp';
  const acceptsBr = /(?:^|,)\s*br(?:\s*;\s*q=(?!0(?:\.0*)?(?:\s|,|$))[\d.]+)?\s*(?:,|$)/i.test(
    acceptEncoding,
  );
  if (stored.contentEncoding === 'br' && !acceptsBr) {
    return { body: brotliDecompressSync(stored.body), contentType };
  }
  return { body: stored.body, contentType, contentEncoding: stored.contentEncoding };
}
