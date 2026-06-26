/**
 * RMH Studios — Library storage health (server-only, admin diagnostic).
 *
 * Answers "where did the files go?" directly: reports whether the server is using
 * durable object storage (S3 / Cloudflare R2) or the EPHEMERAL local-filesystem
 * fallback, and probes each library document's object to list any whose bytes are
 * missing from storage right now. A non-durable backend or a list of missing
 * objects is the smoking gun for uploads that "work, then 404 later".
 */
import { prisma } from '@/lib/prisma.server';
import { s3Configured, objectExists, getBucket } from '@/lib/storage/s3.server';

export type StorageHealth = {
  durable: boolean;
  backend: string;
  bucket: string | null;
  total: number;
  missing: { slug: string; title: string; key: string }[];
};

const CHECK_CAP = 2000;
const CONCURRENCY = 8;

type DocRow = { slug: string; title: string; pdfKey: string | null };

export async function getLibraryStorageHealth(): Promise<StorageHealth> {
  const durable = s3Configured();
  const docs = (await prisma.libraryDocument.findMany({
    select: { slug: true, title: true, pdfKey: true },
    orderBy: { createdAt: 'desc' },
    take: CHECK_CAP,
  })) as DocRow[];

  const missing: { slug: string; title: string; key: string }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < docs.length) {
      const d = docs[cursor++];
      if (!d.pdfKey) continue;
      const ok = await objectExists(d.pdfKey).catch(() => false);
      if (!ok) missing.push({ slug: d.slug, title: d.title, key: d.pdfKey });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, docs.length) }, worker));

  let bucket: string | null = null;
  if (durable) {
    try {
      bucket = getBucket();
    } catch {
      bucket = null;
    }
  }

  return {
    durable,
    backend: durable
      ? 'Object storage (S3 / Cloudflare R2)'
      : 'Local filesystem — EPHEMERAL: files vanish when the container recycles',
    bucket,
    total: docs.length,
    missing,
  };
}
