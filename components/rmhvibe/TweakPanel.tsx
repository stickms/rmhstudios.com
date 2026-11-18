/**
 * TweakPanel — the knobs a vibe page declares (colour, slider, toggle, select).
 *
 * Anyone can play with them: a change goes to the frame immediately and is not
 * stored. Only the owner gets Save. Labels and options come from the model, so
 * they are only ever rendered as text.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type {
  TweakSpec,
  TweakValue,
} from '@/lib/rmhvibe/tweaks';

const FIELD =
  'h-9 rounded-site border border-site-border bg-site-surface px-2 text-sm font-medium text-site-text';

/** The knob's value at its step's precision (0.1 + 0.2 reads 0.3, not 0.30000000000000004). */
export function formatRange(
  value: number,
  step?: number,
): string {
  if (
    !Number.isFinite(
      value,
    )
  )
    return '';
  const text =
    String(
      step &&
        step >
          0
        ? step
        : 0,
    );
  const exp =
    /e-(\d+)$/.exec(
      text,
    );
  const decimals =
    exp
      ? Number(
          exp[1],
        )
      : (text.split(
          '.',
        )[1]
          ?.length ??
        0);
  // No step ('any'): trim float noise to a readable length.
  return step &&
    step >
      0
    ? value.toFixed(
        Math.min(
          decimals,
          6,
        ),
      )
    : String(
        Number(
          value.toFixed(
            3,
          ),
        ),
      );
}

function Row({
  spec,
  value,
  onChange,
}: {
  spec: TweakSpec;
  value: TweakValue;
  onChange: (
    v: TweakValue,
  ) => void;
}) {
  const id =
    useId();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-site-border py-2 last:border-b-0">
      <label
        htmlFor={
          id
        }
        className="t-body min-w-0 flex-1 truncate"
      >
        {
          spec.label
        }
      </label>
      {spec.type ===
        'color' && (
        <input
          id={
            id
          }
          type="color"
          value={String(
            value,
          )}
          onChange={(
            e,
          ) =>
            onChange(
              e
                .target
                .value,
            )
          }
          className="h-9 w-12 cursor-pointer rounded-site border border-site-border bg-site-surface p-1"
        />
      )}
      {spec.type ===
        'range' && (
        <span className="flex items-center gap-2">
          <input
            id={
              id
            }
            type="range"
            min={
              spec.min
            }
            max={
              spec.max
            }
            step={
              spec.step ??
              'any'
            }
            value={Number(
              value,
            )}
            onChange={(
              e,
            ) =>
              onChange(
                e
                  .target
                  .valueAsNumber,
              )
            }
            className="w-32"
          />
          <span className="t-meta w-12 text-right">
            {formatRange(
              Number(
                value,
              ),
              spec.step,
            )}
          </span>
        </span>
      )}
      {spec.type ===
        'toggle' && (
        <Switch
          id={
            id
          }
          checked={
            value ===
            true
          }
          onCheckedChange={
            onChange
          }
          aria-label={
            spec.label
          }
        />
      )}
      {spec.type ===
        'select' && (
        <select
          id={
            id
          }
          value={String(
            value,
          )}
          onChange={(
            e,
          ) =>
            onChange(
              e
                .target
                .value,
            )
          }
          className={
            FIELD
          }
        >
          {spec.options?.map(
            (
              o,
            ) => (
              <option
                key={
                  o
                }
                value={
                  o
                }
              >
                {
                  o
                }
              </option>
            ),
          )}
        </select>
      )}
    </div>
  );
}

export function TweakPanel({
  spec,
  values,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  spec: TweakSpec[];
  values: Record<
    string,
    TweakValue
  >;
  onChange: (
    key: string,
    value: TweakValue,
  ) => void;
  onClose: () => void;
  /** Present only for the page's owner. */
  onSave?: () => void;
  saving?: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'pages',
    );
  return (
    <div
      role="dialog"
      aria-label={t(
        'tweak-title',
        {
          defaultValue:
            'Tweak',
        },
      )}
      className="surface-overlay fixed bottom-[calc(0.75rem+var(--safe-bottom))] right-[calc(0.75rem+var(--safe-right))] z-40 w-[min(320px,calc(100vw-1.5rem))] p-3"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="t-label">
          {t(
            'tweak-title',
            {
              defaultValue:
                'Tweak',
            },
          )}
        </p>
        <button
          type="button"
          onClick={
            onClose
          }
          aria-label={t(
            'close',
            {
              defaultValue:
                'Close',
            },
          )}
          className="vibe-panel__close"
        >
          <X
            size={
              16
            }
          />
        </button>
      </div>
      <div>
        {spec.map(
          (
            s,
          ) => (
            <Row
              key={
                s.key
              }
              spec={
                s
              }
              value={
                values[
                  s
                    .key
                ] ??
                s.default
              }
              onChange={(
                v,
              ) =>
                onChange(
                  s.key,
                  v,
                )
              }
            />
          ),
        )}
      </div>
      {onSave && (
        <button
          type="button"
          onClick={
            onSave
          }
          disabled={
            saving
          }
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-site bg-site-accent text-sm font-medium text-site-accent-fg disabled:opacity-50"
        >
          {saving && (
            <Loader2
              size={
                14
              }
              className="animate-spin"
            />
          )}
          {t(
            'tweak-save',
            {
              defaultValue:
                'Save',
            },
          )}
        </button>
      )}
    </div>
  );
}
