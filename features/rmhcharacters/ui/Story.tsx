/** Portrait, description, backstory, notes and homebrew entries. */
import { useRef, useState } from 'react';
import { ImageUp, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/shared/app-toast';
import { newId } from '@features/rmhcharacters/engine/factory';
import type { Character } from '@features/rmhcharacters/engine/types';
import { Field, Section } from './controls';

/** Shrink an uploaded image to a 384px square-ish JPEG data URL (kept well under the 400 KB cap). */
async function toPortrait(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function Story<C extends Character>({ c, set }: { c: C; set: (fn: (c: C) => C) => void }) {
  const { t } = useTranslation('c-rmhcharacters');
  const file = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState('');
  const text = (key: 'appearance' | 'personality' | 'backstory' | 'notes', label: string, rows = 4) => (
    <Field label={label}>
      <Textarea rows={rows} value={c[key]} onChange={(e) => {
        const v = e.target.value.slice(0, 20_000);
        set((x) => ({ ...x, [key]: v }));
      }} />
    </Field>
  );
  return (
    <div className="rmhc-columns">
      <div>
        <Section title={t('story.portrait', { defaultValue: 'Portrait' })}>
          <div className="flex items-center gap-4">
            {c.portrait ? (
              <img src={c.portrait} alt={t('story.portraitAlt', { defaultValue: 'Portrait of {{name}}', name: c.name })} className="size-28 rounded-app border border-app-border object-cover" />
            ) : (
              <div className="size-28 rounded-app border border-app-border bg-app-bg-subtle" />
            )}
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => file.current?.click()}>
                <ImageUp aria-hidden /> {t('story.upload', { defaultValue: 'Upload image' })}
              </Button>
              {c.portrait ? (
                <Button type="button" variant="ghost" onClick={() => set((x) => { const { portrait: _drop, ...rest } = x; void _drop; return rest as C; })}>
                  {t('story.removePortrait', { defaultValue: 'Remove' })}
                </Button>
              ) : null}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const portrait = await toPortrait(f);
                  set((x) => ({ ...x, portrait }));
                } catch {
                  toast.error(t('story.badImage', { defaultValue: 'That image could not be read.' }));
                }
              }}
            />
          </div>
        </Section>
        <Section title={t('story.identity', { defaultValue: 'Identity' })}>
          <div className="flex flex-col gap-3">
            <Field label={t('story.player', { defaultValue: 'Player name' })}>
              <Input value={c.playerName} onChange={(e) => {
                const v = e.target.value.slice(0, 120);
                set((x) => ({ ...x, playerName: v }));
              }} />
            </Field>
            <Field label={t('story.languages', { defaultValue: 'Languages' })}>
              <div className="flex flex-wrap gap-2">
                {c.languages.map((l) => (
                  <Button key={l} type="button" size="xs" variant="ghost" onClick={() => set((x) => ({ ...x, languages: x.languages.filter((y) => y !== l) }))} aria-label={t('story.removeLanguage', { defaultValue: 'Remove {{name}}', name: l })}>
                    {l} ×
                  </Button>
                ))}
              </div>
            </Field>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = lang.trim().slice(0, 60);
                if (v && !c.languages.includes(v)) set((x) => ({ ...x, languages: [...x.languages, v] }));
                setLang('');
              }}
            >
              <Input value={lang} onChange={(e) => setLang(e.target.value)} placeholder={t('story.addLanguage', { defaultValue: 'Add a language' })} aria-label={t('story.addLanguage', { defaultValue: 'Add a language' })} />
              <Button type="submit">{t('inv.add', { defaultValue: 'Add' })}</Button>
            </form>
          </div>
        </Section>
        <Section title={t('story.description', { defaultValue: 'Description' })}>
          <div className="flex flex-col gap-3">
            {text('appearance', t('story.appearance', { defaultValue: 'Appearance' }), 3)}
            {text('personality', t('story.personality', { defaultValue: 'Personality, ideals, bonds and flaws' }), 4)}
          </div>
        </Section>
      </div>
      <div>
        <Section title={t('story.backstory', { defaultValue: 'Backstory' })}>{text('backstory', t('story.backstory', { defaultValue: 'Backstory' }), 10)}</Section>
        <Section title={t('story.notes', { defaultValue: 'Notes' })}>{text('notes', t('story.notes', { defaultValue: 'Notes' }), 6)}</Section>
        <Section
          title={t('story.custom', { defaultValue: 'Homebrew and other books' })}
          action={
            <Button type="button" size="sm" onClick={() => set((x) => ({ ...x, custom: [...x.custom, { id: newId(), name: '', text: '', kind: 'Feature' }] }))}>
              <Plus aria-hidden /> {t('story.addEntry', { defaultValue: 'Add entry' })}
            </Button>
          }
        >
          <p className="mb-3 text-sm text-app-text-muted">
            {t('story.customHint', { defaultValue: 'Anything the built-in rules do not carry: a subclass, feat, item or spell from another book, or a GM ruling. It prints on the sheet and the advisor reads it.' })}
          </p>
          <ul className="flex flex-col">
            {c.custom.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 border-b border-app-border py-3 last:border-b-0">
                <div className="flex gap-2">
                  <Input value={e.name} placeholder={t('story.entryName', { defaultValue: 'Name' })} aria-label={t('story.entryName', { defaultValue: 'Name' })} onChange={(ev) => {
                    const v = ev.target.value.slice(0, 200);
                    set((x) => ({ ...x, custom: x.custom.map((y) => (y.id === e.id ? { ...y, name: v } : y)) }));
                  }} />
                  <Input value={e.kind ?? ''} placeholder={t('story.entryKind', { defaultValue: 'Kind' })} aria-label={t('story.entryKind', { defaultValue: 'Kind' })} className="w-36" onChange={(ev) => {
                    const v = ev.target.value.slice(0, 60);
                    set((x) => ({ ...x, custom: x.custom.map((y) => (y.id === e.id ? { ...y, kind: v } : y)) }));
                  }} />
                  <Button type="button" variant="ghost" size="icon" aria-label={t('story.removeEntry', { defaultValue: 'Remove entry' })} onClick={() => set((x) => ({ ...x, custom: x.custom.filter((y) => y.id !== e.id) }))}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <Textarea rows={3} value={e.text} aria-label={t('story.entryText', { defaultValue: 'Rules text' })} onChange={(ev) => {
                  const v = ev.target.value.slice(0, 10_000);
                  set((x) => ({ ...x, custom: x.custom.map((y) => (y.id === e.id ? { ...y, text: v } : y)) }));
                }} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
