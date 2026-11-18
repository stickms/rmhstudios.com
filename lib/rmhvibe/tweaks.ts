/**
 * RMHVibe — tweaks: the few visual knobs a page declares (colours, sliders,
 * toggles, selects) that viewers can play with live and the owner can save.
 *
 * Client-safe and zod-free: the viewer panel and the server share these
 * validators. Anything that comes from the model or from a request body is
 * untrusted until it has passed through `parseTweakSpec` / `validateTweakValues`.
 */

import { clamp } from '@/lib/core/math';

export type TweakType =
  | 'color'
  | 'range'
  | 'toggle'
  | 'select';
export type TweakValue =
  | string
  | number
  | boolean;

export type TweakSpec =
  {
    /** CSS-variable safe (`--tweak-<key>`), at most 32 chars. */
    key: string;
    /** At most 40 chars; rendered as text. */
    label: string;
    type: TweakType;
    default: TweakValue;
    min?: number;
    max?: number;
    step?: number;
    /** Select only: at most 8 options of at most 40 chars. */
    options?: string[];
  };

export const MAX_TWEAKS = 8;
export const MAX_TWEAK_KEY = 32;
export const MAX_TWEAK_LABEL = 40;
export const MAX_TWEAK_OPTIONS = 8;
export const MAX_TWEAK_OPTION = 40;

/**
 * A subset of the bridge's `KEY_RE` that the in-frame runtime also accepts for
 * `--tweak-<key>` (it skips keys with `:` or `.`).
 */
const TWEAK_KEY_RE =
  /^[A-Za-z0-9_-]{1,32}$/;
const COLOR_RE =
  /^#[0-9a-fA-F]{6}$/;

const TYPES: readonly TweakType[] =
  [
    'color',
    'range',
    'toggle',
    'select',
  ];

function isRecord(
  v: unknown,
): v is Record<
  string,
  unknown
> {
  return (
    typeof v ===
      'object' &&
    v !==
      null &&
    !Array.isArray(
      v,
    )
  );
}

function finite(
  v: unknown,
): v is number {
  return (
    typeof v ===
      'number' &&
    Number.isFinite(
      v,
    )
  );
}

function parseOne(
  raw: unknown,
): TweakSpec | null {
  if (
    !isRecord(
      raw,
    )
  )
    return null;
  const {
    key,
    label,
    type,
  } =
    raw;
  if (
    typeof key !==
      'string' ||
    !TWEAK_KEY_RE.test(
      key,
    )
  )
    return null;
  if (
    typeof label !==
    'string'
  )
    return null;
  const text =
    label
      .trim()
      .slice(
        0,
        MAX_TWEAK_LABEL,
      );
  if (
    !text
  )
    return null;
  if (
    typeof type !==
      'string' ||
    !TYPES.includes(
      type as TweakType,
    )
  )
    return null;
  const base =
    {
      key,
      label:
        text,
    };

  switch (
    type as TweakType
  ) {
    case 'color':
      if (
        typeof raw.default !==
          'string' ||
        !COLOR_RE.test(
          raw.default,
        )
      )
        return null;
      return {
        ...base,
        type: 'color',
        default:
          raw.default,
      };
    case 'toggle':
      if (
        typeof raw.default !==
        'boolean'
      )
        return null;
      return {
        ...base,
        type: 'toggle',
        default:
          raw.default,
      };
    case 'range': {
      const {
        min,
        max,
        step,
      } =
        raw;
      if (
        !finite(
          min,
        ) ||
        !finite(
          max,
        ) ||
        !(
          min <
          max
        ) ||
        !finite(
          raw.default,
        )
      )
        return null;
      const out: TweakSpec =
        {
          ...base,
          type: 'range',
          default:
            clamp(
              raw.default,
              min,
              max,
            ),
          min,
          max,
        };
      if (
        finite(
          step,
        ) &&
        step >
          0
      )
        out.step =
          step;
      return out;
    }
    case 'select': {
      if (
        !Array.isArray(
          raw.options,
        )
      )
        return null;
      const options =
        [
          ...new Set(
            raw.options.filter(
              (
                o,
              ): o is string =>
                typeof o ===
                  'string' &&
                o.length >
                  0 &&
                o.length <=
                  MAX_TWEAK_OPTION,
            ),
          ),
        ].slice(
          0,
          MAX_TWEAK_OPTIONS,
        );
      if (
        typeof raw.default !==
          'string' ||
        !options.includes(
          raw.default,
        )
      )
        return null;
      return {
        ...base,
        type: 'select',
        default:
          raw.default,
        options,
      };
    }
  }
}

/** Keep at most 8 valid, uniquely keyed entries; drop everything else. Never throws. */
export function parseTweakSpec(
  raw: unknown,
): TweakSpec[] {
  if (
    !Array.isArray(
      raw,
    )
  )
    return [];
  const out: TweakSpec[] =
    [];
  const seen =
    new Set<string>();
  for (const item of raw) {
    if (
      out.length >=
      MAX_TWEAKS
    )
      break;
    const spec =
      parseOne(
        item,
      );
    if (
      !spec ||
      seen.has(
        spec.key,
      )
    )
      continue;
    seen.add(
      spec.key,
    );
    out.push(
      spec,
    );
  }
  return out;
}

function validValue(
  spec: TweakSpec,
  v: unknown,
):
  | TweakValue
  | undefined {
  switch (
    spec.type
  ) {
    case 'color':
      return typeof v ===
        'string' &&
        COLOR_RE.test(
          v,
        )
        ? v
        : undefined;
    case 'toggle':
      return typeof v ===
        'boolean'
        ? v
        : undefined;
    case 'range':
      return finite(
        v,
      )
        ? clamp(
            v,
            spec.min ??
              v,
            spec.max ??
              v,
          )
        : undefined;
    case 'select':
      return typeof v ===
        'string' &&
        spec.options?.includes(
          v,
        )
        ? v
        : undefined;
  }
}

/** Keep only known keys whose value is valid for their type (ranges are clamped). */
export function validateTweakValues(
  spec: TweakSpec[],
  values: unknown,
): Record<
  string,
  TweakValue
> {
  const out: Record<
    string,
    TweakValue
  > =
    {};
  if (
    !isRecord(
      values,
    )
  )
    return out;
  for (const s of spec) {
    if (
      !Object.prototype.hasOwnProperty.call(
        values,
        s.key,
      )
    )
      continue;
    const v =
      validValue(
        s,
        values[
          s
            .key
        ],
      );
    if (
      v !==
      undefined
    )
      out[
        s.key
      ] =
        v;
  }
  return out;
}

/** The value of every knob: the saved one if valid, else the spec default. */
export function resolveTweakValues(
  spec: TweakSpec[],
  saved: unknown,
): Record<
  string,
  TweakValue
> {
  const valid =
    validateTweakValues(
      spec,
      saved,
    );
  return Object.fromEntries(
    spec.map(
      (
        s,
      ) => [
        s.key,
        valid[
          s
            .key
        ] ??
          s.default,
      ],
    ),
  );
}
