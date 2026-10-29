/**
 * Which TF2 language `#Token` labels are shown in: the site's language when the game ships it,
 * else English, until one is picked here. A language
 * is available when its `resource/tf_<language>.txt` is in the base, the project or
 * a game file loaded here (kept on this device, never part of an export).
 */
'use client';

import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  TF_LANGUAGES,
  hasLanguage,
  languageFilePath,
  languageOf,
} from '@/lib/tf2-hud/localisation';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { useTfLanguage } from '@/lib/tf2-hud/use-scene';
import { useEditor } from '@/lib/tf2-hud/store';
import { IconBtn, SelectField } from './ui';

export default function LanguageControl() {
  const { t } = useTranslation('c-tf2-hud');
  const language = useTfLanguage();
  const setPref = useTf2HudPrefs((s) => s.set);
  const hasFile = useEditor((s) => s.hasFile);
  const baseStatus = useEditor((s) => s.baseStatus);
  const tfAssets = useEditor((s) => s.tfAssets);
  const setTfAssets = useEditor((s) => s.setTfAssets);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = languageOf(bytes);
    if (!id || !TF_LANGUAGES.some((l) => l.id === id)) {
      toast.error(
        t('language-file-bad', {
          defaultValue: 'That is not a TF2 language file (expected tf_english.txt or similar).',
        }),
      );
      return;
    }
    await setTfAssets(new Map([...tfAssets, [languageFilePath(id), bytes]]));
    setPref('language', id);
    toast.success(t('language-loaded', { defaultValue: 'Loaded {{name}} strings', name: id }));
  };

  return (
    <div className="flex items-center">
      <SelectField
        aria-label={t('language', { defaultValue: 'Language for #tokens' })}
        title={t('language-hint', {
          defaultValue:
            'Language for #Token labels. Strings come from resource/tf_<language>.txt; English is used when a token is missing.',
        })}
        value={language}
        onChange={(e) => setPref('language', e.target.value)}
        className="w-36"
      >
        {TF_LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
            {baseStatus === 'ready' && !hasLanguage(l.id, hasFile)
              ? ` · ${t('no-file', { defaultValue: 'no file' })}`
              : ''}
          </option>
        ))}
      </SelectField>
      <IconBtn
        icon={Upload}
        label={t('load-language', { defaultValue: 'Load a TF2 language file (tf_english.txt…)' })}
        onClick={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
