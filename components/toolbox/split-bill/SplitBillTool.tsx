import { useId, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { splitBill, type BillInput } from '@/lib/toolbox/split-bill';

interface Row {
  id: number;
  name: string;
  weight: string;
}

const MAX_PEOPLE = 50;

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SplitBillTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const tipOnId = useId();
  const roundId = useId();
  const nextId = useRef(3);
  const [subtotal, setSubtotal] = useState('84.50');
  const [tax, setTax] = useState('8');
  const [tip, setTip] = useState('18');
  const [tipOn, setTipOn] = useState<BillInput['tipOn']>('pre-tax');
  const [roundUpTo, setRoundUpTo] = useState<BillInput['roundUpTo']>(0);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: '', weight: '1' },
    { id: 2, name: '', weight: '1' },
  ]);

  const personName = (row: Row, i: number) =>
    row.name.trim() || t('split-person', { defaultValue: 'Person {{n}}', n: i + 1 });
  const result = splitBill({
    subtotal: Math.max(0, Number(subtotal) || 0),
    taxPercent: Math.max(0, Number(tax) || 0),
    tipPercent: Math.max(0, Number(tip) || 0),
    tipOn,
    roundUpTo,
    people: rows.map((row, i) => ({ name: personName(row, i), weight: Math.max(0, Number(row.weight) || 0) })),
  });
  const money = (n: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <ToolFrame slug="split-bill">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('split-subtotal', { defaultValue: 'Bill before tax' })} value={subtotal} onChange={setSubtotal} />
        <Field label={t('split-tax', { defaultValue: 'Tax (%)' })} value={tax} onChange={setTax} />
        <Field label={t('split-tip', { defaultValue: 'Tip (%)' })} value={tip} onChange={setTip} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={tipOnId}>{t('split-tip-on', { defaultValue: 'Tip on' })}</Label>
          <Select id={tipOnId} value={tipOn} onChange={(e) => setTipOn(e.target.value as BillInput['tipOn'])}>
            <option value="pre-tax">{t('split-tip-pre', { defaultValue: 'The bill before tax' })}</option>
            <option value="post-tax">{t('split-tip-post', { defaultValue: 'The bill with tax' })}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={roundId}>{t('split-round', { defaultValue: 'Round each share up' })}</Label>
          <Select
            id={roundId}
            value={roundUpTo}
            onChange={(e) => setRoundUpTo(Number(e.target.value) as BillInput['roundUpTo'])}
          >
            <option value={0}>{t('split-round-none', { defaultValue: 'No, exact to the cent' })}</option>
            <option value={5}>{money(0.05)}</option>
            <option value={50}>{money(0.5)}</option>
            <option value={100}>{money(1)}</option>
          </Select>
        </div>
      </div>

      <ToolSection
        title={t('split-people', { defaultValue: 'People and shares' })}
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={rows.length >= MAX_PEOPLE}
            onClick={() => setRows((prev) => [...prev, { id: nextId.current++, name: '', weight: '1' }])}
          >
            <Plus aria-hidden />
            {t('split-add', { defaultValue: 'Add person' })}
          </Button>
        }
      >
        <p className="t-body text-site-text-muted">
          {t('split-shares-hint', {
            defaultValue: 'Everyone pays one share. Give someone 2 to have them pay twice as much.',
          })}
        </p>
        <ul>
          {rows.map((row, i) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 border-b border-site-border py-2 last:border-b-0 sm:flex-nowrap"
            >
              <Input
                aria-label={t('split-name', { defaultValue: 'Name' })}
                value={row.name}
                placeholder={t('split-person', { defaultValue: 'Person {{n}}', n: i + 1 })}
                onChange={(e) => update(row.id, { name: e.target.value })}
                className="min-w-0 basis-full sm:basis-auto sm:flex-1"
              />
              <Input
                aria-label={t('split-weight', { defaultValue: 'Shares for {{name}}', name: personName(row, i) })}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={row.weight}
                onChange={(e) => update(row.id, { weight: e.target.value })}
                className="w-20"
              />
              <span className="min-w-24 flex-1 text-right font-mono text-sm sm:flex-none">
                {money(result.shares[i]?.amount ?? 0)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={rows.length <= 1}
                aria-label={t('split-remove', { defaultValue: 'Remove {{name}}', name: personName(row, i) })}
                onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title={t('split-totals', { defaultValue: 'Totals' })}>
        <div aria-live="polite">
          <ResultRow label={t('split-tax-amount', { defaultValue: 'Tax' })} value={money(result.tax)} />
          <ResultRow label={t('split-tip-amount', { defaultValue: 'Tip' })} value={money(result.tip)} />
          <ResultRow label={t('split-total', { defaultValue: 'Total' })} value={money(result.total)} />
          {result.surplus > 0 && (
            <ResultRow
              label={t('split-surplus', { defaultValue: 'Extra from rounding up' })}
              value={money(result.surplus)}
            />
          )}
        </div>
      </ToolSection>
    </ToolFrame>
  );
}
