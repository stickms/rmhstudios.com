'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Captions } from 'lucide-react';
import { toast } from 'sonner';

/**
 * "Load captions" for a native <video>: pick a local WebVTT file and hand back a
 * blob URL for a `<track kind="captions">`. Size and background come from the
 * member's caption settings (`video::cue` in globals.css). The caller owns the
 * URL and must revoke it.
 */
export function CaptionFileButton({
  onUrl,
  className,
}: {
  onUrl: (url: string) => void;
  className?: string;
}) {
  const { t } = useTranslation('f-access');
  const input = useRef<HTMLInputElement>(null);
  const label = t('cap-load', { defaultValue: 'Load captions (.vtt)' });

  async function onFile(file: File | undefined) {
    if (!file) return;
    const head = (await file.slice(0, 16).text()).replace(/^\uFEFF/, '');
    if (!head.startsWith('WEBVTT')) {
      toast.error(t('cap-invalid', { defaultValue: 'That is not a WebVTT file.' }));
      return;
    }
    onUrl(URL.createObjectURL(file));
    toast.success(t('cap-loaded', { defaultValue: 'Captions loaded.' }));
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => input.current?.click()}
        aria-label={label}
        title={label}
      >
        <Captions size={18} aria-hidden />
      </button>
      <input
        ref={input}
        type="file"
        accept=".vtt,text/vtt"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}
