import { useCallback, useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { renderMacro, type ModMacroDTO } from '@/lib/safety/macros';

export type MacroScope = { kind: 'admin' } | { kind: 'community'; slug: string };

const base = (s: MacroScope) =>
  s.kind === 'admin' ? '/api/admin/mod-macros' : `/api/communities/${s.slug}/macros`;

// One fetch per scope per page, shared by every row that mounts a picker.
const cache = new Map<string, Promise<ModMacroDTO[]>>();
function loadMacros(scope: MacroScope): Promise<ModMacroDTO[]> {
  const url = base(scope);
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: ModMacroDTO[] }) => d.items ?? [])
      .catch(() => []);
    cache.set(url, p);
  }
  return p;
}

/**
 * S4: a message box a moderator can fill from a saved macro ({{user}} and
 * {{reason}} are substituted) and save new macros from. `value` is the message
 * the caller sends along with the decision.
 */
export function MacroField({
  scope,
  vars,
  value,
  onChange,
}: {
  scope: MacroScope;
  vars: { user?: string; reason?: string };
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('f-safety');
  const [macros, setMacros] = useState<ModMacroDTO[]>([]);
  const [picked, setPicked] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');

  const scopeKey = base(scope);
  useEffect(() => {
    let live = true;
    void loadMacros(scope).then((m) => live && setMacros(m));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const save = useCallback(async () => {
    const res = await fetch(scopeKey, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: value }),
    });
    if (!res.ok) {
      toast.error(t('macro-save-failed', { defaultValue: "Couldn't save the macro" }));
      return;
    }
    const macro = (await res.json()) as ModMacroDTO;
    cache.delete(scopeKey);
    setMacros((m) => [macro, ...m]);
    setSaving(false);
    setTitle('');
  }, [scopeKey, title, value, t]);

  const remove = useCallback(async () => {
    const res = await fetch(`${scopeKey}?id=${encodeURIComponent(picked)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) return;
    cache.delete(scopeKey);
    setMacros((m) => m.filter((x) => x.id !== picked));
    setPicked('');
  }, [scopeKey, picked]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          controlSize="sm"
          containerClassName="inline-block w-auto"
          className="w-auto min-w-40"
          aria-label={t('macro-pick', { defaultValue: 'Insert a saved response' })}
          value={picked}
          onChange={(e) => {
            const id = e.target.value;
            setPicked(id);
            const macro = macros.find((m) => m.id === id);
            if (macro) onChange(renderMacro(macro.body, vars));
          }}
        >
          <option value="">{t('macro-none', { defaultValue: 'Saved responses…' })}</option>
          {macros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
        {picked && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={remove}
            aria-label={t('macro-delete', { defaultValue: 'Delete this saved response' })}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={t('macro-message-placeholder', {
          defaultValue:
            'Optional message to the author. Use {{user}} and {{reason}} in saved responses.',
        })}
      />
      {value.trim() &&
        (saving ? (
          <div className="flex items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder={t('macro-title-placeholder', { defaultValue: 'Name this response' })}
              aria-label={t('macro-title-placeholder', { defaultValue: 'Name this response' })}
            />
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={!title.trim()}
              onClick={save}
            >
              {t('macro-save', { defaultValue: 'Save' })}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setSaving(true)}
          >
            <Save className="mr-1 h-4 w-4" aria-hidden />
            {t('macro-save-as', { defaultValue: 'Save as a macro' })}
          </Button>
        ))}
    </div>
  );
}
