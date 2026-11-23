/**
 * Looks up Signal Forge content text (a card's name, an enemy's move, an event choice...) by its key. The keys are
 * built from ids, so the literal `t()` calls live in the generated `content-labels.ts`; this hook evaluates them
 * once per language and returns a lookup with the engine's English as the fallback.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { contentLabels } from './content-labels';

export type ContentText = (key: string, fallback: string) => string;

export function useContentText(): ContentText {
  const { t } = useTranslation('c-signal-forge');
  return useMemo(() => {
    const labels = contentLabels(t);
    return (key: string, fallback: string) => labels[key] ?? fallback;
  }, [t]);
}
