/**
 * RmhCalculatorApp — shell for RMHCalculator.
 *
 * Owns the two things shared across both surfaces: the DeepSeek model choice
 * (persisted to localStorage) and the Scientific/Graphing tab. Every calculation
 * and every graph is produced by DeepSeek — this app performs no math of its own.
 */

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FunctionSquare, LineChart, Sigma } from 'lucide-react';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { CALC_MODELS, type CalcModel } from '@/lib/rmhcalculator/types';
import { ModelToggle } from '@/components/rmhcalculator/ModelToggle';
import { ScientificCalculator } from '@/components/rmhcalculator/ScientificCalculator';
import { GraphingCalculator } from '@/components/rmhcalculator/GraphingCalculator';

const MODEL_STORAGE_KEY = 'rmhcalc:model';
type Mode = 'scientific' | 'graphing';

function isCalcModel(v: unknown): v is CalcModel {
  return typeof v === 'string' && (CALC_MODELS as readonly string[]).includes(v);
}

export function RmhCalculatorApp() {
  const { t } = useTranslation('c-rmhcalculator');
  const [mode, setMode] = useState<Mode>('scientific');
  const [model, setModel] = useState<CalcModel>('reasoner');

  // Restore the persisted model choice after mount (SSR-safe).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (isCalcModel(saved)) setModel(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const changeModel = (next: CalcModel) => {
    setModel(next);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const tabs = [
    {
      id: 'scientific',
      label: t('tab-scientific', { defaultValue: 'Scientific' }),
      icon: Sigma,
    },
    {
      id: 'graphing',
      label: t('tab-graphing', { defaultValue: 'Graphing' }),
      icon: LineChart,
    },
  ];

  return (
    <div className="rmhcalc">
      <header className="rmhcalc__header">
        <Link to="/" className="rmhcalc__brand" aria-label={t('home', { defaultValue: 'RMH Studios home' })}>
          <span className="rmhcalc__brand-icon" aria-hidden="true">
            <FunctionSquare size={20} />
          </span>
          <span className="rmhcalc__brand-text">
            <span className="rmhcalc__brand-name">RMHCalculator</span>
            <span className="rmhcalc__brand-sub">
              {t('tagline', { defaultValue: 'Powered by DeepSeek' })}
            </span>
          </span>
        </Link>
        <ModelToggle value={model} onChange={changeModel} />
      </header>

      <div className="rmhcalc__tabs">
        <LiquidTabs
          aria-label={t('mode', { defaultValue: 'Calculator mode' })}
          value={mode}
          onChange={(id) => setMode(id as Mode)}
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
        {mode === 'graphing' && <GraphingCalculator model={model} />}
      </main>
    </div>
  );
}
