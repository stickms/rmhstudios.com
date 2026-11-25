/**
 * AddSubtitlesDialog — attach `.vtt` or `.srt` subtitles to a queue item (sprint 11 16).
 *
 * The file is checked on `File.size` (256 KB) before it is read, parsed in this browser into plain-text cues, and only the
 * cues are sent; the file itself is never uploaded or stored. The dialog also lists the item's tracks so the adder or the
 * host can remove one. Up to three per item, one per label.
 */

import { useCallback, useId, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { toast } from '@/lib/shared/app-toast';
import type { ClientQueueItem } from '@/lib/rmhtube/types';
import {
  SUBTITLE_LIMITS,
  normalizeLabel,
  normalizeLang,
  parseSubtitles,
  serialisedCueBytes,
  type SubtitleCue,
} from '@/lib/rmhtube/subtitles';

type FileProblem = 'too-big' | 'empty' | 'no-cues' | 'too-many' | 'unreadable' | 'cues-too-big';

interface Parsed {
  name: string;
  cues: SubtitleCue[];
  dropped: number;
}

export default function AddSubtitlesDialog({ item, onClose }: { item: ClientQueueItem | null; onClose: () => void }) {
  const { t } = useTranslation('rmhtube-subtitles');
  const fileId = useId();
  const labelId = useId();
  const langId = useId();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [problem, setProblem] = useState<FileProblem | null>(null);
  const [label, setLabel] = useState('');
  const [lang, setLang] = useState('');
  const [fieldError, setFieldError] = useState<'label' | 'lang' | null>(null);
  const focusOnMount = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  if (!item) return null;
  const tracks = item.subtitles ?? [];
  const full = tracks.length >= SUBTITLE_LIMITS.MAX_PER_ITEM;

  const onFile = async (file: File | undefined) => {
    setParsed(null);
    setProblem(null);
    if (!file) return;
    // Size first, before anything is read.
    if (file.size > SUBTITLE_LIMITS.MAX_FILE_BYTES) return setProblem('too-big');
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setProblem('unreadable');
    }
    const result = parseSubtitles(text);
    if (!result.ok) {
      return setProblem(
        result.reason === 'empty'
          ? 'empty'
          : result.reason === 'too_many_cues'
            ? 'too-many'
            : result.reason === 'too_large'
              ? 'too-big'
              : 'no-cues',
      );
    }
    if (serialisedCueBytes(result.cues) > SUBTITLE_LIMITS.MAX_JSON_BYTES) return setProblem('cues-too-big');
    setParsed({ name: file.name, cues: result.cues, dropped: result.dropped });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || full) return;
    const cleanLabel = normalizeLabel(label);
    if (!cleanLabel) return setFieldError('label');
    const cleanLang = lang.trim() === '' ? undefined : (normalizeLang(lang) ?? null);
    if (cleanLang === null) return setFieldError('lang');
    const sent = emit(C2S.SUBTITLE_ADD, { itemId: item.id, label: cleanLabel, lang: cleanLang, cues: parsed.cues });
    if (!sent) {
      toast.error(t('send-failed', { defaultValue: "Couldn't send the subtitles. Check your connection." }));
      return;
    }
    onClose();
  };

  const problemText: Record<FileProblem, string> = {
    'too-big': t('problem-too-big', { defaultValue: 'That file is over 256 KB.' }),
    empty: t('problem-empty', { defaultValue: 'That file is empty.' }),
    'no-cues': t('problem-no-cues', { defaultValue: 'No subtitles found. Use a .vtt or .srt file.' }),
    'too-many': t('problem-too-many', { defaultValue: 'That file has more than 5,000 cues.' }),
    unreadable: t('problem-unreadable', { defaultValue: "Couldn't read that file." }),
    'cues-too-big': t('problem-cues-too-big', { defaultValue: 'Those subtitles are too large to add.' }),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('close', { defaultValue: 'Close' })}
        className="absolute inset-0 app-scrim cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-subtitles-title"
        className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-app app-glass p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="add-subtitles-title" className="text-lg font-semibold">
            {t('title', { defaultValue: 'Subtitles' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="rounded-app-sm p-1 transition-colors text-app-text-muted hover:text-app-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p dir="auto" className="mb-4 truncate text-sm text-app-text-muted">
          {item.title}
        </p>

        {tracks.length > 0 && (
          <ul className="mb-4 divide-y divide-app-border border-y border-app-border">
            {tracks.map((track) => (
              <li key={track.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  <bdi>{track.label}</bdi>
                  <span className="text-app-text-dim">
                    {' · '}
                    {t('cue-count', {
                      defaultValue_one: '{{count}} cue',
                      defaultValue: '{{count}} cues',
                      count: track.cueCount,
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => emit(C2S.SUBTITLE_REMOVE, { subtitleId: track.id })}
                  className="shrink-0 rounded-app-sm px-2 py-1 text-sm text-app-text-muted transition-colors hover:text-app-danger"
                >
                  {t('remove', { defaultValue: 'Remove' })}
                </button>
              </li>
            ))}
          </ul>
        )}

        {full ? (
          <p className="text-sm text-app-text-muted">
            {t('full', { defaultValue: 'This video has 3 subtitle files. Remove one to add another.' })}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor={fileId} className="mb-1 block text-sm font-medium text-app-text-muted">
                {t('file-label', { defaultValue: 'Subtitle file (.vtt or .srt)' })}
              </label>
              <input
                id={fileId}
                type="file"
                accept=".vtt,.srt,text/vtt"
                onChange={(e) => void onFile(e.target.files?.[0])}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${fileId}-problem` : undefined}
                className="block w-full text-sm text-app-text"
              />
              {problem && (
                <p id={`${fileId}-problem`} role="alert" className="mt-1 text-xs text-app-danger">
                  {problemText[problem]}
                </p>
              )}
              {parsed && (
                <p className="mt-1 text-xs text-app-text-muted">
                  {t('parsed', {
                    defaultValue_one: 'Found {{count}} cue.',
                    defaultValue: 'Found {{count}} cues.',
                    count: parsed.cues.length,
                  })}
                  {parsed.dropped > 0 &&
                    ` ${t('parsed-skipped', {
                      defaultValue_one: '{{count}} entry was skipped.',
                      defaultValue: '{{count}} entries were skipped.',
                      count: parsed.dropped,
                    })}`}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={labelId} className="mb-1 block text-sm font-medium text-app-text-muted">
                {t('label-label', { defaultValue: 'Label' })}
              </label>
              <input
                ref={focusOnMount}
                id={labelId}
                type="text"
                dir="auto"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setFieldError(null);
                }}
                maxLength={SUBTITLE_LIMITS.MAX_LABEL_CHARS}
                placeholder={t('label-placeholder', { defaultValue: 'English' })}
                aria-invalid={fieldError === 'label' ? true : undefined}
                className="w-full rounded-app-sm border border-app-border bg-app-bg px-4 py-2.5 text-app-text outline-none placeholder:text-app-text-dim focus:ring-1 focus:ring-app-accent"
              />
              {fieldError === 'label' && (
                <p role="alert" className="mt-1 text-xs text-app-danger">
                  {t('label-error', { defaultValue: 'Give the subtitles a label of up to 40 characters.' })}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={langId} className="mb-1 block text-sm font-medium text-app-text-muted">
                {t('lang-label', { defaultValue: 'Language tag (optional)' })}
              </label>
              <input
                id={langId}
                type="text"
                dir="auto"
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                  setFieldError(null);
                }}
                maxLength={16}
                placeholder={t('lang-placeholder', { defaultValue: 'en, es, pt-BR' })}
                aria-invalid={fieldError === 'lang' ? true : undefined}
                className="w-full rounded-app-sm border border-app-border bg-app-bg px-4 py-2.5 text-app-text outline-none placeholder:text-app-text-dim focus:ring-1 focus:ring-app-accent"
              />
              {fieldError === 'lang' && (
                <p role="alert" className="mt-1 text-xs text-app-danger">
                  {t('lang-error', { defaultValue: 'That is not a valid language tag.' })}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!parsed}
              className="w-full rounded-app-sm bg-app-accent py-2.5 font-semibold text-app-accent-fg transition-colors hover:bg-app-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('add', { defaultValue: 'Add subtitles' })}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
