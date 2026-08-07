'use client';

/**
 * Fill in an upload's fields from its filename. (Features 8 and 9.)
 *
 * **It hands back suggestions; the uploader submits them.** `onApply` writes
 * into the form's own state, so every value goes through the same fields, the
 * same validation and the same upload route it always did. Nothing here is
 * written to the library.
 *
 * That is not caution for its own sake. The model is reading `04 - trak_FINAL
 * (1).mp3` and guessing at an artist name, and an artist name is a credit
 * attached to a real person on a public page. A field it cannot read comes back
 * blank by design (see the prompt), and a blank the uploader fills in is a far
 * better outcome than a plausible wrong name they accept without reading.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MetadataSuggestion } from '@/lib/slice-it/ai/types';
import { useSliceAi } from './useSliceAi';

export interface MetadataAssistProps {
  filename: string;
  durationSec: number;
  typed: { title?: string; artist?: string; album?: string };
  /** Chart statistics from the client-side analysis, when it has run. */
  chart?: { noteCount: number; averageNps: number; peakNps: number } | null;
  onApply: (suggestion: MetadataSuggestion) => void;
}

interface MetadataBody {
  filename: string;
  durationSec: number;
  typed: { title?: string; artist?: string; album?: string };
  chart?: { noteCount: number; averageNps: number; peakNps: number };
}

export function MetadataAssist({
  filename,
  durationSec,
  typed,
  chart,
  onApply,
}: MetadataAssistProps) {
  const { t } = useTranslation('c-game');
  const ai = useSliceAi<MetadataSuggestion, MetadataBody>(
    'metadata',
    (body) => (body as { suggestion: MetadataSuggestion | null }).suggestion,
  );

  // Applied in an effect rather than inside the select callback: `select` runs
  // during the fetch's state update, and calling the parent's setState from
  // there would be a render-phase update of another component.
  const applied = React.useRef<MetadataSuggestion | null>(null);
  React.useEffect(() => {
    if (ai.state === 'ready' && ai.data && applied.current !== ai.data) {
      applied.current = ai.data;
      onApply(ai.data);
    }
  }, [ai.state, ai.data, onApply]);

  if (!filename) return null;

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={ai.state === 'loading'}
        onClick={() => ai.run({ filename, durationSec, typed, ...(chart ? { chart } : {}) })}
        className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-600 hover:bg-slice-shadow-dark/20 border-none transition-colors shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
      >
        <Wand2 className="w-3 h-3 mr-1" aria-hidden="true" />
        {ai.state === 'loading'
          ? t('ai-metadata-running', { defaultValue: 'Reading filename…' })
          : t('ai-metadata-action', { defaultValue: 'Fill from filename' })}
      </Button>

      {ai.state === 'ready' ? (
        <p className="text-[10px] text-slice-text-light leading-relaxed" aria-live="polite">
          {t('ai-metadata-applied', {
            defaultValue: 'Filled in what it could read. Check it before uploading.',
          })}
        </p>
      ) : null}
      {ai.state === 'unavailable' ? (
        <p className="text-[10px] text-slice-text-light">
          {t('ai-metadata-unavailable', { defaultValue: 'Nothing readable in that filename.' })}
        </p>
      ) : null}
      {ai.state === 'budget' ? (
        <p className="text-[10px] text-slice-text-light">
          {t('ai-budget', {
            defaultValue: "You've used this month's AI allowance. It resets on the 1st.",
          })}
        </p>
      ) : null}
    </div>
  );
}
