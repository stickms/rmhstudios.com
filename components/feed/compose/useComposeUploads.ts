import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaRejection } from '@/hooks/useSmartPaste';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { uploadImagesApi } from '@/lib/media/upload.contract';
import { MAX_IMAGES, appendImages } from './compose-state';

/**
 * The composer's image attachments: the URL and alt lists, the alt editor's
 * open index, upload error and in-flight count, and the upload itself.
 *
 * Posting waits for uploads in flight, and `uploadEpochRef` (bumped by every
 * reset) drops URLs that arrive after the post they belonged to.
 */
export function useComposeUploads() {
  const { t } = useTranslation('feed');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  // Per-image alt text, aligned by index with imageUrls. A missing/empty entry
  // means"no description"; the ALT pill on each preview opens the editor.
  const [imageAlts, setImageAlts] = useState<string[]>([]);
  const [altEditIndex, setAltEditIndex] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // Uploads in flight. Posting waits for them, and `uploadEpochRef` (bumped by
  // every reset) drops URLs that arrive after the post they belonged to.
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploadEpochRef = useRef(0);

  const uploadImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setImageError(null);
    const epoch = uploadEpochRef.current;
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    setUploadingCount((n) => n + 1);
    try {
      const { urls } = await api(uploadImagesApi, { body: form });
      if (epoch !== uploadEpochRef.current) return;
      setImageUrls((prev) => appendImages(prev, urls));
    } catch (e) {
      if (epoch === uploadEpochRef.current) setImageError(serverError(e) ?? 'Upload failed');
    } finally {
      setUploadingCount((n) => Math.max(0, n - 1));
    }
  }, []);

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void uploadImages(Array.from(files).slice(0, MAX_IMAGES - imageUrls.length));
  };

  // ── Paste / drop (B16) ───────────────────────────────────────────────────
  // Files are screened against the media policy BEFORE the upload starts, so an
  // over-quota drop is refused in the same frame instead of after 20 MB has gone
  // up the wire. The hook ships reason CODES, not sentences — it has no `t()` —
  // so this maps them to copy.
  const explainRejection = useCallback(
    (rejections: MediaRejection[]) => {
      const [first] = rejections;
      if (!first) return;
      if (first.reason === 'too-large') {
        setImageError(
          t('image-too-large', {
            name: first.file.name,
            defaultValue: '{{name}} is too large — images must be under 5 MB.',
          }),
        );
      } else if (first.reason === 'unsupported-type') {
        setImageError(
          t('image-unsupported', {
            name: first.file.name,
            defaultValue: "{{name}} isn't a supported image (PNG, JPEG, GIF or WebP).",
          }),
        );
      } else {
        setImageError(
          t('image-over-limit', {
            count: MAX_IMAGES,
            defaultValue: 'You can attach at most {{count}} images.',
          }),
        );
      }
    },
    [t],
  );

  return {
    imageUrls,
    setImageUrls,
    imageAlts,
    setImageAlts,
    altEditIndex,
    setAltEditIndex,
    imageError,
    setImageError,
    uploadingCount,
    uploadEpochRef,
    uploadImages,
    handleImageFiles,
    explainRejection,
  };
}
