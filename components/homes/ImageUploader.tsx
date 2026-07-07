'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, X } from 'lucide-react';
import { toast } from 'sonner';

interface ImageUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}

/** Upload endpoint accepts up to 4 files per request. */
const CHUNK = 4;

/**
 * Multi-photo uploader for a listing. Posts to the shared /api/rmharks/image
 * endpoint (WebP-compressed, stored to S3/R2) and collects the returned URLs.
 * The first image is the cover; photos can be removed or promoted to cover.
 */
export function ImageUploader({ value, onChange, max = 8 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.error(`You can add up to ${max} photos.`);
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    setUploading(true);
    try {
      const collected: string[] = [];
      for (let i = 0; i < files.length; i += CHUNK) {
        const form = new FormData();
        for (const f of files.slice(i, i + CHUNK)) form.append('images', f);
        const res = await fetch('/api/rmharks/image', { method: 'POST', body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Upload failed');
        }
        const data = await res.json();
        collected.push(...(data.urls ?? []));
      }
      onChange([...value, ...collected].slice(0, max));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  function makeCover(url: string) {
    onChange([url, ...value.filter((u) => u !== url)]);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, i) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-site-sm border border-site-border bg-site-bg"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                <Star className="h-3 w-3 fill-current" /> Cover
              </span>
            )}
            <div className="absolute inset-0 flex items-start justify-end gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(url)}
                  aria-label="Make cover photo"
                  className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove photo"
                className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-site-sm border border-dashed border-site-border text-site-text-muted transition-colors hover:border-site-accent/50 hover:text-site-text disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Add photo</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="mt-1.5 text-xs text-site-text-muted">
        Up to {max} photos. The first is the cover — hover a photo to set it as cover or remove it.
      </p>
    </div>
  );
}
