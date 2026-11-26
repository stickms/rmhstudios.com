/**
 * Save graph, Copy link and the "plot again" notice for the Graphing tab (s15-08).
 *
 * Save asks for a name through `usePrompt` and stores the plotted functions, domain and result, so the graph can be
 * reopened later with no model call. Copy link puts a link on the clipboard that opens the same functions (and
 * domain) in anyone's calculator: it carries no points and no saved list, and opening it never plots by itself.
 */
import { useTranslation } from 'react-i18next';
import { Check, Link2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useCalcGraphActions } from '@/components/rmhcalculator/useCalcGraphs';
import { useClipboard } from '@/hooks/useClipboard';
import { compactGraphResult } from '@/lib/rmhcalculator/graph-compact';
import { buildGraphLink, type GraphLinkContent } from '@/lib/rmhcalculator/graph-link';
import type { GraphResult } from '@/lib/rmhcalculator/types';
import { toast } from '@/lib/toast';

/** What a graph on screen was plotted from. */
export interface PlottedGraph extends GraphLinkContent {
  result: GraphResult;
}

interface GraphActionsProps {
  /** The graph on screen, with the request it was plotted from; null before the first plot. */
  plotted: PlottedGraph | null;
  /** True when that graph is already a saved one. */
  saved: boolean;
  /** The functions and domain in the form right now, or null when they cannot make a link (no function, bad domain). */
  linkContent: GraphLinkContent | null;
  busy: boolean;
  onSaved: (id: string) => void;
}

const NAME_MAX = 80;

export function GraphActions({ plotted, saved, linkContent, busy, onSaved }: GraphActionsProps) {
  const { t } = useTranslation('calc-graphs');
  const prompt = usePrompt();
  const refusalText = useRefusalText();
  const { create } = useCalcGraphActions();
  const { copied, copy } = useClipboard();

  const save = async () => {
    if (!plotted) return;
    const name = await prompt({
      title: t('save-title', { defaultValue: 'Save this graph' }),
      label: t('name-label', { defaultValue: 'Graph name' }),
      initialValue: plotted.functions.join(', ').slice(0, NAME_MAX),
      confirmLabel: t('save-confirm', { defaultValue: 'Save' }),
      validate: (value) =>
        value.trim() === ''
          ? t('name-required', { defaultValue: 'Enter a name for the graph' })
          : value.trim().length > NAME_MAX
            ? t('name-too-long', { defaultValue: 'Use {{max}} characters or fewer', max: NAME_MAX })
            : null,
    });
    const title = name?.trim();
    if (!title) return;
    try {
      const { id } = await create.mutateAsync({
        title,
        functions: plotted.functions,
        domainMin: plotted.domain?.min ?? null,
        domainMax: plotted.domain?.max ?? null,
        result: compactGraphResult(plotted.result),
      });
      onSaved(id);
      toast.success(t('saved-ok', { defaultValue: 'Graph saved' }));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('save-failed', { defaultValue: 'Could not save the graph' }));
    }
  };

  const copyLink = async () => {
    const link = linkContent ? buildGraphLink(window.location.origin, linkContent) : null;
    if (!link) return;
    const ok = await copy(link);
    if (ok) toast.success(t('link-copied', { defaultValue: 'Link copied' }));
    else toast.error(t('link-copy-failed', { defaultValue: 'Could not copy the link' }));
  };

  return (
    <div className="rmhcalc-graph__actions">
      <Button
        variant="default"
        size="sm"
        disabled={!plotted || saved || busy}
        loading={create.isPending}
        onClick={() => void save()}
      >
        {saved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
        {saved ? t('saved', { defaultValue: 'Saved' }) : t('save-graph', { defaultValue: 'Save graph' })}
      </Button>
      <Button variant="default" size="sm" disabled={!linkContent} onClick={() => void copyLink()}>
        {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {copied ? t('link-copied-label', { defaultValue: 'Copied' }) : t('copy-link', { defaultValue: 'Copy link' })}
      </Button>
    </div>
  );
}

/** Shown in place of a saved graph whose stored points no longer read: the functions are back, the graph is not drawn. */
export function GraphReplotNotice({ onReplot, busy }: { onReplot: () => void; busy: boolean }) {
  const { t } = useTranslation('calc-graphs');
  return (
    <div className="rmhcalc-graph__empty">
      <p>{t('replot-needed', { defaultValue: 'This saved graph has to be plotted again.' })}</p>
      <Button variant="default" size="sm" disabled={busy} onClick={onReplot}>
        {t('replot', { defaultValue: 'Plot again' })}
      </Button>
    </div>
  );
}
