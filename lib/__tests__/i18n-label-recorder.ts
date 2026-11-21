/**
 * A recording `t` for the label-map tests (`*-labels.test.ts`).
 *
 * A label map (`components/settings/settings-nav-labels.ts` and its siblings)
 * is a function of `t` that makes one literal `t('key', { ns, defaultValue })`
 * call per string. Passing it this `t` returns the English (the default, the
 * way i18next answers for a key no locale has) and records each call, so a test
 * can hold the keys, the namespace and the English against the list the map
 * mirrors.
 */
import type { TFunction } from 'i18next';

export interface RecordedCall {
  key: string;
  ns: string | undefined;
  defaultValue: string;
}

export function recordingT(): { t: TFunction; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const t = ((key: string, opts: { ns?: string; defaultValue: string; [name: string]: unknown }) => {
    calls.push({ key, ns: opts.ns, defaultValue: opts.defaultValue });
    // Interpolate like i18next does, so a default with `{{name}}` reads as English.
    return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(opts[name] ?? ''));
  }) as unknown as TFunction;
  return { t, calls };
}

/** The recorded calls as `key -> English`, asserting each key is called once. */
export function englishByKey(calls: readonly RecordedCall[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of calls) {
    if (c.key in out) throw new Error(`key ${c.key} is translated twice`);
    out[c.key] = c.defaultValue;
  }
  return out;
}
