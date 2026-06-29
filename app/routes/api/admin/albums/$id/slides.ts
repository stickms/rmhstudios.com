import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { albumAssetUrl } from '@/lib/storage/keys';
import { logAdminAction } from '@/lib/admin-audit.server';
import { addImageSlide, addVideoSlide, type SlideRecord } from '@/lib/albums.admin.server';

/**
 * POST /api/admin/albums/$id/slides — bulk-upload media into an album. Admin
 * only. Accepts many files at once (form field `files`, repeated). Images are
 * compressed to WebP, videos transcoded to MP4 + poster, then stored in object
 * storage. Returns the created slides plus any per-file failures so the UI can
 * report partial success. Admins get a deliberately liberal rate limit.
 */

// Generous per-file caps — admin uploads of originals can be large.
const MAX_IMAGE_BYTES = 64 * 1024 * 1024; // 64 MB
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_FILES_PER_REQUEST = 50;

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv|m2ts)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp)$/i;

function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}
function isImage(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = (dot > 0 ? name.slice(0, dot) : name).trim();
  return stem || 'media';
}

function publicSlide(s: SlideRecord) {
  return {
    id: s.id,
    type: s.type,
    position: s.position,
    thumb: albumAssetUrl(s.thumbKey),
    src: albumAssetUrl(s.srcKey),
  };
}

export const Route = createFileRoute('/api/admin/albums/$id/slides')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Liberal backstop only (admin-gated): guards against runaway loops, not
        // normal bulk usage.
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 2000,
          windowMs: 60_000,
          prefix: 'album-upload',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many uploads, briefly. Try again shortly.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
          );
        }

        const album = await prisma.album.findUnique({ where: { id: params.id }, select: { id: true } });
        if (!album) return Response.json({ error: 'Album not found.' }, { status: 404 });

        const formData = await request.formData().catch(() => null);
        if (!formData) return Response.json({ error: 'Invalid upload.' }, { status: 400 });
        // Idempotency keys aligned to `files` by index (client sends one per file)
        // so a retried upload resolves to the same slide instead of duplicating.
        const rawFiles = formData.getAll('files');
        const rawKeys = formData.getAll('uploadKey');
        const indexed: { file: File; key?: string }[] = [];
        rawFiles.forEach((f, i) => {
          if (f instanceof File && f.size > 0) {
            const k = rawKeys[i];
            indexed.push({ file: f, key: typeof k === 'string' ? k : undefined });
          }
        });
        const files = indexed.map((e) => e.file);
        if (files.length === 0) return Response.json({ error: 'No files provided.' }, { status: 400 });
        if (files.length > MAX_FILES_PER_REQUEST) {
          return Response.json(
            { error: `Too many files in one request (max ${MAX_FILES_PER_REQUEST}). Upload in batches.` },
            { status: 400 }
          );
        }

        const created: ReturnType<typeof publicSlide>[] = [];
        const errors: { name: string; error: string }[] = [];

        // Sequential to bound memory (sharp/ffmpeg are heavy) and keep slide
        // order stable to the selection order.
        for (const { file, key } of indexed) {
          const uploadKey = key || undefined;
          try {
            const video = isVideo(file);
            if (!video && !isImage(file)) {
              errors.push({ name: file.name, error: 'Unsupported file type.' });
              continue;
            }
            if (video && file.size > MAX_VIDEO_BYTES) {
              errors.push({ name: file.name, error: 'Video too large (max 1 GB).' });
              continue;
            }
            if (!video && file.size > MAX_IMAGE_BYTES) {
              errors.push({ name: file.name, error: 'Image too large (max 64 MB).' });
              continue;
            }

            const raw = Buffer.from(await file.arrayBuffer());
            const stem = baseName(file.name);
            const slide = video
              ? await addVideoSlide(album.id, raw, { download: `${stem}.mp4`, uploadKey })
              : await addImageSlide(album.id, raw, { download: `${stem}.webp`, uploadKey });
            created.push(publicSlide(slide));
          } catch (err) {
            console.error('[albums] slide upload failed:', file.name, err);
            errors.push({ name: file.name, error: 'Processing failed.' });
          }
        }

        if (created.length > 0) {
          await logAdminAction(session.user.id, 'album.slides-upload', {
            targetType: 'Album',
            targetId: album.id,
            detail: `${created.length} slide(s)`,
          });
        }

        return Response.json({ created, errors });
      },
    },
  },
});
