/**
 * RmhCalculatorApp — shell for RMHCalculator.
 *
 * Owns the two things shared across both surfaces: the DeepSeek model choice
 * (persisted to localStorage) and the Scientific/Graphing tab. Every calculation
 * and every graph is produced by DeepSeek — this app performs no math of its own.
 *
 * A graph link (`?tab=graph&f=…`, s15-08) opens the Graphing tab with the link's functions and domain filled in. It
 * never plots: the recipient presses Plot, which is their own model call under their own rate limit.
 */

import { lazy, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FunctionSquare, LineChart, Sigma } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { CALC_MODELS, type CalcModel } from '@/lib/rmhcalculator/types';
import { parseGraphLink, type GraphLinkContent } from '@/lib/rmhcalculator/graph-link';
import { toast } from '@/lib/toast';
import { ModelToggle } from '@/components/rmhcalculator/ModelToggle';
import { ScientificCalculator } from '@/components/rmhcalculator/ScientificCalculator';
import { GraphingCalculator } from '@/components/rmhcalculator/GraphingCalculator';
import { useNotebookTab } from '@/components/rmhcalculator/useNotebookTab';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { ArrivalSuspense } from '@/components/ui/arrive';

const MODEL_STORAGE_KEY = 'rmhcalc:model';
type Mode = 'scientific' | 'graphing' | 'notebook';
const NotebookTab = lazy(() => import('@/components/rmhcalculator/NotebookTab'));

function isCalcModel(v: unknown): v is CalcModel {
  return typeof v === 'string' && (CALC_MODELS as readonly string[]).includes(v);
}

export function RmhCalculatorApp() {
  const { t } = useTranslation(['c-rmhcalculator', 'calc-graphs']);
  const goBack = useBackOrFallback();
  const [mode, setMode] = useState<Mode>('scientific');
  const [model, setModel] = useState<CalcModel>('reasoner');
  const [linkInit, setLinkInit] = useState<GraphLinkContent | undefined>(undefined);

  // Restore the persisted model choice after mount (SSR-safe).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (isCalcModel(saved)) setModel(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // A graph link fills the Graphing tab after mount (the server never sees the viewer's query string).
  const linkRead = useRef(false);
  useEffect(() => {
    if (linkRead.current) return;
    linkRead.current = true;
    const link = parseGraphLink(window.location.search);
    if (link.ok) {
      setLinkInit({ functions: link.functions, domain: link.domain });
      setMode('graphing');
    } else if (link.reason !== 'none') {
      toast.error(
        t('link-invalid', {
          ns: 'calc-graphs',
          defaultValue: 'That graph link could not be read, so nothing was filled in.',
        }),
      );
    }
  }, [t]);

  const changeModel = (next: CalcModel) => {
    setModel(next);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const notebookTab = useNotebookTab();
  const tabs = [
    {
      id: 'scientific',
      label: t('tab-scientific', {
        defaultValue: 'Scientific',
      }),
      icon: Sigma,
    },
    {
      id: 'graphing',
      label: t('tab-graphing', {
        defaultValue: 'Graphing',
      }),
      icon: LineChart,
    },
    notebookTab,
  ];

  return (
    <div className="rmhcalc">
      <header className="rmhcalc__header">
        {/* The brand used to be the only way out — a link with no visible
            "back" affordance, pointing somewhere different from every other
            app. It is a lockup again; the exit is the labelled control. */}
        <div className="rmhcalc__brand">
          <span className="rmhcalc__brand-icon" aria-hidden="true">
            <FunctionSquare size={20} />
          </span>
          <span className="rmhcalc__brand-text">
            <h1 className="rmhcalc__brand-name">RMHCalculator</h1>
          </span>
        </div>
        <div className="rmhcalc__header-actions">
          <ModelToggle value={model} onChange={changeModel} />
          <Link to="/games" search={{ kind: 'app' }} onClick={goBack} className="rmhcalc__back">
            <span aria-hidden="true">&larr;</span>
            {t('back-to-builds', {
              defaultValue: 'Builds',
            })}
          </Link>
        </div>
      </header>

      <div className="rmhcalc__tabs">
        <Tabs
          aria-label={t('mode', {
            defaultValue: 'Calculator mode',
          })}
          value={mode}
          onChange={(id) => {
            setMode(id as Mode);
            if (id !== 'graphing') setLinkInit(undefined);
          }}
          tabs={tabs}
          idBase="rmhcalc-mode"
        />
      </div>

      <main
        className="rmhcalc__content"
        id="rmhcalc-mode-panel-scientific"
        role="tabpanel"
        aria-labelledby="rmhcalc-mode-tab-scientific"
        hidden={mode !== 'scientific'}
      >
        {mode === 'scientific' && <ScientificCalculator model={model} />}
      </main>
      <main
        className="rmhcalc__content"
        id="rmhcalc-mode-panel-graphing"
        role="tabpanel"
        aria-labelledby="rmhcalc-mode-tab-graphing"
        hidden={mode !== 'graphing'}
      >
        {mode === 'graphing' && <GraphingCalculator model={model} initial={linkInit} />}
      </main>
      <main
        className="rmhcalc__content"
        id="rmhcalc-mode-panel-notebook"
        role="tabpanel"
        aria-labelledby="rmhcalc-mode-tab-notebook"
        hidden={mode !== 'notebook'}
      >
        {mode === 'notebook' && (
          <ArrivalSuspense fallback={null}>
            <NotebookTab />
          </ArrivalSuspense>
        )}
      </main>
    </div>
  );
}
