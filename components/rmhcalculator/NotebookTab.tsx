import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { evaluateNotebook } from '@/lib/rmhcalculator/notebook';
import { toolsApi } from '@/lib/tools/client';

interface Notebook {
  id: string | null;
  title: string;
  body: string;
}

const STARTER =
  '# Notebook - one calculation per line\nrent = $1,450 / 3\n5 ft in cm\n20% of 150\nrent * 12';

export default function NotebookTab() {
  const { t } = useTranslation('f-tools');
  const [saved, setSaved] = useState<Array<Notebook & { id: string }>>([]);
  const [nb, setNb] = useState<Notebook>({ id: null, title: '', body: STARTER });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    toolsApi<{ notebooks: Array<Notebook & { id: string }> }>('GET', '/api/calc-notebooks')
      .then((d) => {
        setSaved(d.notebooks);
        if (d.notebooks[0]) setNb(d.notebooks[0]);
      })
      .catch(() =>
        toast.error(t('calc-load-failed', { defaultValue: 'Could not load your notebooks' })),
      );
  }, [t]);

  const results = useMemo(() => evaluateNotebook(nb.body), [nb.body]);
  const lines = nb.body.split('\n').length;

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const title = nb.title.trim() || t('calc-untitled', { defaultValue: 'Untitled notebook' });
      const payload = { title, body: nb.body };
      if (nb.id) {
        await toolsApi('PUT', `/api/calc-notebooks/${nb.id}`, payload);
        setSaved((s) => s.map((x) => (x.id === nb.id ? { ...x, ...payload } : x)));
        setNb((n) => ({ ...n, title }));
      } else {
        const { id } = await toolsApi<{ id: string }>('POST', '/api/calc-notebooks', payload);
        setSaved((s) => [{ id, ...payload }, ...s]);
        setNb({ id, ...payload });
      }
      setDirty(false);
      toast.success(t('calc-saved', { defaultValue: 'Notebook saved' }));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('calc-save-failed', { defaultValue: 'Could not save' }),
      );
    } finally {
      setBusy(false);
    }
  }, [nb, t]);

  const remove = useCallback(async () => {
    if (!nb.id) return;
    setBusy(true);
    try {
      await toolsApi('DELETE', `/api/calc-notebooks/${nb.id}`);
      const rest = saved.filter((x) => x.id !== nb.id);
      setSaved(rest);
      setNb(rest[0] ?? { id: null, title: '', body: '' });
      setDirty(false);
    } catch {
      toast.error(t('calc-delete-failed', { defaultValue: 'Could not delete' }));
    } finally {
      setBusy(false);
    }
  }, [nb.id, saved, t]);

  const edit = (patch: Partial<Notebook>) => {
    setNb((n) => ({ ...n, ...patch }));
    setDirty(true);
  };

  return (
    <section className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('calc-pick', { defaultValue: 'Choose a notebook' })}
          value={nb.id ?? ''}
          onChange={(e) => {
            const next = saved.find((x) => x.id === e.target.value);
            if (next) {
              setNb(next);
              setDirty(false);
            }
          }}
          className="glass-inset h-9 rounded-site-sm px-2 text-sm text-site-text"
        >
          {!nb.id && (
            <option value="">{t('calc-unsaved', { defaultValue: 'Unsaved notebook' })}</option>
          )}
          {saved.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
        <input
          value={nb.title}
          onChange={(e) => edit({ title: e.target.value })}
          maxLength={120}
          aria-label={t('calc-title', { defaultValue: 'Notebook title' })}
          placeholder={t('calc-title', { defaultValue: 'Notebook title' })}
          className="glass-inset h-9 min-w-0 flex-1 rounded-site-sm px-3 text-sm text-site-text"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNb({ id: null, title: '', body: '' });
            setDirty(false);
          }}
        >
          <Plus /> {t('calc-new', { defaultValue: 'New' })}
        </Button>
        <Button size="sm" onClick={save} disabled={busy || !dirty}>
          <Save /> {t('calc-save', { defaultValue: 'Save' })}
        </Button>
        {nb.id && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            disabled={busy}
            aria-label={t('calc-delete', { defaultValue: 'Delete notebook' })}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="glass-pane grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-0 overflow-hidden rounded-site font-mono text-sm leading-6">
        <textarea
          value={nb.body}
          onChange={(e) => edit({ body: e.target.value })}
          rows={Math.max(lines, 12)}
          wrap="off"
          spellCheck={false}
          maxLength={10_000}
          aria-label={t('calc-editor', { defaultValue: 'Notebook lines' })}
          className="resize-none overflow-x-auto overflow-y-hidden bg-transparent p-3 leading-6 text-site-text outline-none"
        />
        <div className="border-l border-site-border bg-site-surface p-3" aria-live="polite">
          {results.map((r, i) => (
            <div
              key={i}
              className={`h-6 truncate text-right ${r.kind === 'error' ? 'text-site-text-muted' : 'text-site-accent'}`}
              title={r.kind === 'error' ? r.message : undefined}
            >
              {r.kind === 'ok' ? r.text : r.kind === 'error' ? `? ${r.message}` : ' '}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-site-text-muted">
        {t('calc-hint', {
          defaultValue:
            'Every line is computed on your device. Try x = 12, 5 ft in cm, 20% of 150, or ans * 2.',
        })}
      </p>
    </section>
  );
}
