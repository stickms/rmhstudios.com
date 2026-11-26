/**
 * GraphingCalculator — plot one or more functions of x.
 *
 * The functions and an optional x-domain are streamed to DeepSeek, which computes
 * every sample point (and the view window, ticks, and discontinuity breaks). The
 * app never evaluates the functions — it only renders the returned points via
 * <GraphPlot>. Reasoning streams live while the model works.
 *
 * s15-08: a plotted graph can be saved (with its validated result) and reopened from "Saved graphs" with no model
 * call, and the functions and domain can be copied as a link. A link opens here with the form filled in and waits
 * for Plot (`initial`); nothing is plotted until the member presses it.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { graphStream, CalcStreamError } from '@/lib/rmhcalculator/client';
import { GRAPH_SERIES_COLORS, type CalcModel, type GraphResult } from '@/lib/rmhcalculator/types';
import { ReasoningStream } from '@/components/rmhcalculator/ReasoningStream';
import { GraphPlot } from '@/components/rmhcalculator/GraphPlot';
import { GraphActions, GraphReplotNotice, type PlottedGraph } from '@/components/rmhcalculator/GraphActions';
import { SavedGraphs } from '@/components/rmhcalculator/SavedGraphs';
import { useCalcGraphActions } from '@/components/rmhcalculator/useCalcGraphs';
import { compactGraphResult } from '@/lib/rmhcalculator/graph-compact';
import type { GraphLinkContent, GraphLinkDomain } from '@/lib/rmhcalculator/graph-link';
import type { CalcGraphFull } from '@/lib/rmhcalculator/graphs-schema';
import { toast } from '@/lib/toast';

const EXAMPLES = ['sin(x)', 'x^2 - 3', '1/x', 'e^x', 'x^3 - 2x', 'tan(x)', 'ln(x)', 'cos(x)/x'];
const MAX_FUNCTIONS = 4;

/** A saved graph on screen: the row, and the functions and domain it holds. */
interface SavedRef extends GraphLinkContent {
  id: string;
}

const sameDomain = (a: GraphLinkDomain | null, b: GraphLinkDomain | null) =>
  a === null || b === null ? a === b : a.min === b.min && a.max === b.max;
const sameRequest = (a: GraphLinkContent, b: GraphLinkContent) =>
  a.functions.length === b.functions.length &&
  a.functions.every((f, i) => f === b.functions[i]) &&
  sameDomain(a.domain, b.domain);

export function GraphingCalculator({ model, initial }: { model: CalcModel; initial?: GraphLinkContent }) {
  const { t } = useTranslation(['c-rmhcalculator', 'calc-graphs']);
  const abortRef = useRef<AbortController | null>(null);
  const { update } = useCalcGraphActions();

  const [functions, setFunctions] = useState<string[]>(initial?.functions ?? ['sin(x)']);
  const [autoDomain, setAutoDomain] = useState(!initial?.domain);
  const [xMin, setXMin] = useState(initial?.domain ? String(initial.domain.min) : '-10');
  const [xMax, setXMax] = useState(initial?.domain ? String(initial.domain.max) : '10');
  const [computing, setComputing] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [graph, setGraph] = useState<GraphResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the graph on screen was plotted from, and the saved graph (if any) it belongs to.
  const [plotted, setPlotted] = useState<GraphLinkContent | null>(null);
  const [saved, setSaved] = useState<SavedRef | null>(null);
  // A saved graph whose stored points no longer read: its functions are back, the graph is not drawn.
  const [needsReplot, setNeedsReplot] = useState(false);

  const setFunctionAt = (i: number, value: string) =>
    setFunctions((prev) => prev.map((f, idx) => (idx === i ? value : f)));
  const addFunction = () => setFunctions((prev) => (prev.length >= MAX_FUNCTIONS ? prev : [...prev, '']));
  const removeFunction = (i: number) =>
    setFunctions((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const plot = useCallback(() => {
    const fns = functions.map((f) => f.trim()).filter(Boolean);
    if (fns.length === 0 || computing) return;

    let domain:
      | {
          min: number;
          max: number;
        }
      | undefined;
    if (!autoDomain) {
      const min = Number(xMin);
      const max = Number(xMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        setError(
          t('bad-domain', {
            defaultValue: 'Enter a valid domain (min < max).',
          }),
        );
        return;
      }
      domain = {
        min,
        max,
      };
    }
    const request: GraphLinkContent = { functions: fns, domain: domain ?? null };

    abortRef.current?.abort();
    setComputing(true);
    setReasoning('');
    setError(null);
    setNeedsReplot(false);

    const { promise, controller } = graphStream(
      {
        functions: fns,
        model,
        angleMode: 'rad',
        domain,
      },
      {
        onThinking: (d) => setReasoning((r) => r + d),
        onGraph: (g) => {
          setGraph(g);
          setPlotted(request);
          // Plotting a saved graph again stores the new result in its row; plotting anything else leaves the row alone.
          if (saved && sameRequest(saved, request)) {
            update.mutate(
              {
                id: saved.id,
                body: {
                  functions: request.functions,
                  domainMin: request.domain?.min ?? null,
                  domainMax: request.domain?.max ?? null,
                  result: compactGraphResult(g),
                },
              },
              {
                onError: () =>
                  toast.error(
                    t('update-failed', {
                      ns: 'calc-graphs',
                      defaultValue: 'Could not update the saved graph',
                    }),
                  ),
              },
            );
          } else {
            setSaved(null);
          }
        },
      },
    );
    abortRef.current = controller;
    promise
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof CalcStreamError
            ? err.message
            : t('error-generic', {
                defaultValue: 'Something went wrong.',
              });
        setError(message);
      })
      .finally(() => {
        if (abortRef.current === controller) {
          setComputing(false);
          abortRef.current = null;
        }
      });
  }, [functions, computing, autoDomain, xMin, xMax, model, t, saved, update]);

  // A saved graph opened from the list: its stored result is drawn at once and no model call is made.
  const openSaved = (g: CalcGraphFull) => {
    abortRef.current?.abort();
    abortRef.current = null;
    const domain = g.domainMin !== null && g.domainMax !== null ? { min: g.domainMin, max: g.domainMax } : null;
    setComputing(false);
    setReasoning('');
    setError(null);
    setFunctions(g.functions);
    setAutoDomain(domain === null);
    setXMin(domain ? String(domain.min) : '-10');
    setXMax(domain ? String(domain.max) : '10');
    setGraph(g.result);
    setNeedsReplot(g.result === null);
    setPlotted(g.result ? { functions: g.functions, domain } : null);
    setSaved({ id: g.id, functions: g.functions, domain });
  };

  // The form's own functions and domain, for the link: null when they could not make one.
  const linkContent = useMemo((): GraphLinkContent | null => {
    const fns = functions.map((f) => f.trim()).filter(Boolean);
    if (fns.length === 0) return null;
    if (autoDomain) return { functions: fns, domain: null };
    const min = Number(xMin);
    const max = Number(xMax);
    if (xMin.trim() === '' || xMax.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }
    return { functions: fns, domain: { min, max } };
  }, [functions, autoDomain, xMin, xMax]);

  const plottedGraph: PlottedGraph | null = plotted && graph ? { ...plotted, result: graph } : null;

  return (
    <div className="rmhcalc-graph">
      <div className="rmhcalc-graph__controls">
        <div className="rmhcalc-graph__fns">
          {functions.map((fn, i) => (
            <div key={i} className="rmhcalc-fnrow">
              <span
                className="rmhcalc-fnrow__swatch"
                style={{
                  background: GRAPH_SERIES_COLORS[i % GRAPH_SERIES_COLORS.length],
                }}
                aria-hidden="true"
              />
              <span className="rmhcalc-fnrow__prefix">y =</span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="rmhcalc-fnrow__input"
                placeholder={t('fn-placeholder', {
                  defaultValue: 'function of x',
                })}
                aria-label={t('fn-aria', {
                  defaultValue: 'Function {{n}}',
                  n: i + 1,
                })}
                value={fn}
                onChange={(e) => setFunctionAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    plot();
                  }
                }}
              />
              {functions.length > 1 && (
                <button
                  type="button"
                  className="rmhcalc-fnrow__remove"
                  aria-label={t('remove-fn', {
                    defaultValue: 'Remove function',
                  })}
                  onClick={() => removeFunction(i)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}

          {functions.length < MAX_FUNCTIONS && (
            <button type="button" className="rmhcalc-graph__add" onClick={addFunction}>
              <Plus size={14} aria-hidden="true" />
              {t('add-fn', {
                defaultValue: 'Add function',
              })}
            </button>
          )}
        </div>

        {/* Example chips */}
        <div className="rmhcalc-graph__examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rmhcalc-chip"
              onClick={() =>
                setFunctions((prev) => {
                  // Fill the first empty slot, else replace the first function.
                  const idx = prev.findIndex((f) => !f.trim());
                  if (idx !== -1) return prev.map((f, i) => (i === idx ? ex : f));
                  return prev.map((f, i) => (i === 0 ? ex : f));
                })
              }
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Domain */}
        <div className="rmhcalc-graph__domain">
          <label className="rmhcalc-check">
            <input type="checkbox" checked={autoDomain} onChange={(e) => setAutoDomain(e.target.checked)} />
            <span>
              {t('auto-domain', {
                defaultValue: 'Auto domain',
              })}
            </span>
          </label>
          {!autoDomain && (
            <div className="rmhcalc-graph__range">
              <label className="rmhcalc-field">
                <span>
                  {t('x-min', {
                    defaultValue: 'x min',
                  })}
                </span>
                <input
                  type="number"
                  className="rmhcalc-field__input"
                  value={xMin}
                  onChange={(e) => setXMin(e.target.value)}
                />
              </label>
              <label className="rmhcalc-field">
                <span>
                  {t('x-max', {
                    defaultValue: 'x max',
                  })}
                </span>
                <input
                  type="number"
                  className="rmhcalc-field__input"
                  value={xMax}
                  onChange={(e) => setXMax(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <Button
          variant="default"
          className="w-full"
          onClick={plot}
          loading={computing}
          loadingText={t('plotting', {
            defaultValue: 'Plotting…',
          })}
        >
          <LineChart size={16} aria-hidden="true" />
          {t('plot', {
            defaultValue: 'Plot',
          })}
        </Button>

        <GraphActions
          plotted={plottedGraph}
          saved={saved !== null && plotted !== null && sameRequest(saved, plotted)}
          linkContent={linkContent}
          busy={computing}
          onSaved={(id) => plotted && setSaved({ id, ...plotted })}
        />

        <ReasoningStream text={reasoning} active={computing} />

        <SavedGraphs
          activeId={saved?.id ?? null}
          onOpen={openSaved}
          onDeleted={(id) => {
            if (saved?.id === id) setSaved(null);
          }}
        />
      </div>

      <div className="rmhcalc-graph__canvas">
        {error ? (
          <div className="rmhcalc-graph__error">{error}</div>
        ) : needsReplot ? (
          <GraphReplotNotice onReplot={plot} busy={computing} />
        ) : graph ? (
          <>
            <GraphPlot graph={graph} />
            {graph.notes ? <p className="rmhcalc-graph__notes">{graph.notes}</p> : null}
          </>
        ) : (
          <div className={cn('rmhcalc-graph__empty', computing && 'is-busy')}>
            <LineChart size={40} aria-hidden="true" />
            <p>
              {computing
                ? t('graph-computing-2', {
                    defaultValue: 'Plotting your graph…',
                  })
                : t('graph-empty', {
                    defaultValue: 'Enter a function and press Plot.',
                  })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
