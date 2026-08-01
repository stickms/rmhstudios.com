'use client';

/**
 * Select — a themed dropdown, popup included.
 *
 * ## Why this is not a native `<select>` any more
 *
 * It used to be one: a styled control with a lucide chevron, and the option list
 * left to the platform. That is a defensible v1 — a native picker is the most
 * accessible listbox there is, and it costs nothing — but it means the *menu*,
 * the part people actually look at while choosing, was drawn by the OS in the
 * OS's colours. On a site whose whole contract is that every surface re-themes
 * through `--site-*`, opening a select punched a grey platform rectangle through
 * the glass, in every theme, including high-contrast. So the list is ours now,
 * built on Radix's Select — the house rule is Radix primitives over hand-rolled
 * interactive widgets, and keyboard nav, typeahead, focus management,
 * collision-aware positioning and the listbox ARIA wiring come with it rather
 * than being re-derived here.
 *
 * ## The API is still the native one
 *
 * Callers write `<option>` children and read `e.target.value` off `onChange`,
 * exactly as before, so the swap needs no edits at any of the call sites and no
 * flag-day. The shim below translates:
 *
 *  - **children** — `<option>` / `<optgroup>` elements (through fragments and
 *    arrays) are read into Radix items. Anything else is ignored rather than
 *    rendered raw, because a stray node inside a listbox breaks its semantics.
 *  - **onChange** — Radix reports the new value; this synthesises the
 *    `{ target: { value, name } }` shape every existing caller destructures.
 *    Nothing here reads the other event fields, so the cast is honest about what
 *    it is: as much of a ChangeEvent as callers actually use.
 *  - **the empty string** — Radix refuses `value=""` on an item (it reserves it
 *    for "nothing selected"), and several forms here use `<option value="">` as
 *    their placeholder / "any" row. Those map to a private sentinel on the way
 *    in and back to `''` on the way out, so callers keep their empty string.
 *
 * `name` is forwarded, so Radix renders its hidden native input and plain
 * `<form>` submission keeps working.
 */

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Which token contract the control paints in.
 *
 * `site` is the `--site-*` design language (every `_site` route). `app` is the
 * parallel `--app-*` contract the full-screen apps use
 * (`components/shared/app-theme.css`) — RMHbox, the studio, the minigames. They
 * are separate palettes on purpose, and a site-token dropdown opened inside a
 * dark app reads as a bug, so the tier is explicit rather than guessed.
 *
 * The app tier also portals differently: `--app-*` is declared on the
 * `.app-theme` shell element, not on `:root`, so a popup portalled to `<body>`
 * would resolve every one of those variables to nothing. It portals into the
 * shell instead — which also keeps the `data-app-theme` appearance variant.
 */
export type SelectTier = 'site' | 'app';

/**
 * Stands in for `''`, which Radix will not accept as an item value. Long and
 * private so it can never collide with a real option value.
 */
const EMPTY_VALUE = '__rmh_select_empty__';
const toItemValue = (value: string) => (value === '' ? EMPTY_VALUE : value);
const fromItemValue = (value: string) => (value === EMPTY_VALUE ? '' : value);

type OptionNode = {
  kind: 'option';
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};
type GroupNode = { kind: 'group'; label: string; options: OptionNode[] };
type ParsedNode = OptionNode | GroupNode;

/**
 * Read `<option>` / `<optgroup>` children into a data model.
 *
 * Descends through fragments and arrays, because call sites build their lists
 * with `.map()` and conditionals. A native `<option>` may carry its text in a
 * `label` attribute instead of children, so both are honoured, and an option
 * with no explicit `value` falls back to its text exactly as HTML does.
 */
function parseOptions(children: React.ReactNode): ParsedNode[] {
  const out: ParsedNode[] = [];

  const readOption = (element: React.ReactElement): OptionNode => {
    const props = element.props as React.OptionHTMLAttributes<HTMLOptionElement> & {
      children?: React.ReactNode;
    };
    const label = props.children ?? props.label ?? '';
    return {
      kind: 'option',
      value: String(props.value ?? (typeof label === 'string' ? label : '')),
      label,
      disabled: props.disabled,
    };
  };

  const walk = (node: React.ReactNode, into: ParsedNode[]) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment) {
        walk((child.props as { children?: React.ReactNode }).children, into);
        return;
      }
      if (child.type === 'option') {
        into.push(readOption(child));
        return;
      }
      if (child.type === 'optgroup') {
        const props = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement> & {
          children?: React.ReactNode;
        };
        const nested: ParsedNode[] = [];
        walk(props.children, nested);
        into.push({
          kind: 'group',
          label: props.label ?? '',
          options: nested.filter((n): n is OptionNode => n.kind === 'option'),
        });
      }
    });
  };

  walk(children, out);
  return out;
}

/**
 * The trigger is a `<button>`, so the pass-through props are a button's — `id`,
 * `aria-*`, `title`, `tabIndex`, `data-*` all still reach it. What that
 * deliberately drops is the select-only surface (`multiple`, `size`, `autoComplete`
 * on the control itself): this renders a single-value listbox, and a caller that
 * asks for a multi-select should get a compile error rather than a control that
 * silently ignores the prop. `value`/`defaultValue`/`onChange`/`name`/`required`
 * keep their native meaning and are handled explicitly below.
 */
export interface SelectProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value' | 'defaultValue' | 'type'
> {
  /** Compact controls for toolbars; standard form selects keep the 44px target. */
  controlSize?: 'sm' | 'default';
  /** Layout classes for the chevron-owning wrapper. */
  containerClassName?: string;
  value?: string | number;
  defaultValue?: string | number;
  /** Native-shaped change handler — read `e.target.value` as you always have. */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Forwarded to Radix's hidden native input, so `<form>` submission works. */
  name?: string;
  /** Marks that hidden input required, so native form validation still fires. */
  required?: boolean;
  /** Shown when nothing is selected and no option covers the empty value. */
  placeholder?: string;
  /** Token contract to paint in — see {@link SelectTier}. */
  tier?: SelectTier;
}

/** Per-tier classes. Same structure, two palettes. */
const TIER_CLASSES = {
  site: {
    trigger:
      'rounded-[var(--site-control-radius)] border border-site-border bg-site-surface text-site-text shadow-site-sm hover:border-site-text/40 font-mono text-xs font-bold uppercase tracking-wider focus-visible:border-site-accent focus-visible:ring-2 focus-visible:ring-site-accent',
    // `--site-radius`, NOT `--site-control-radius`. The trigger is a control and
    // takes the pill; the POPUP is a panel — a stack of rows — and a 9999px
    // radius on it does not read as "very rounded", it reads as a lozenge, with
    // the first and last rows sliced by the curve and a bulge of empty material
    // at each end. Same mistake one level down: the items were a pill inside a
    // pill. Panel takes the panel radius, rows take the small one.
    content: 'glass-overlay rounded-[var(--site-radius)] text-site-text',
    item: 'rounded-[var(--site-radius-sm)] font-mono text-xs font-bold uppercase tracking-wider text-site-text data-[highlighted]:bg-site-surface-hover data-[state=checked]:text-site-accent',
    label: 'text-site-text-dim',
    scrollButton: 'text-site-text-dim',
    chevron: 'text-site-text-dim',
  },
  app: {
    trigger:
      'rounded-[var(--app-radius-sm)] border border-(--app-border) bg-(--app-surface) text-(--app-text) text-sm hover:border-(--app-border-bright) focus-visible:border-(--app-accent) focus-visible:ring-2 focus-visible:ring-(--app-accent)',
    content:
      'rounded-[var(--app-radius-sm)] border border-(--app-border) bg-(--app-surface) text-(--app-text) shadow-[var(--app-shadow)]',
    item: 'rounded-[var(--app-radius-sm)] text-sm text-(--app-text) data-[highlighted]:bg-(--app-surface-hover) data-[state=checked]:text-(--app-accent)',
    label: 'text-(--app-text-dim)',
    scrollButton: 'text-(--app-text-dim)',
    chevron: 'text-(--app-text-dim)',
  },
} as const;

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      children,
      controlSize = 'default',
      containerClassName,
      value,
      defaultValue,
      onChange,
      name,
      disabled,
      required,
      placeholder,
      tier = 'site',
      ...props
    },
    ref,
  ) => {
    const nodes = React.useMemo(() => parseOptions(children), [children]);
    const styles = TIER_CLASSES[tier];

    // `--app-*` lives on the `.app-theme` shell, so an app-tier popup has to be
    // portalled inside it or every token resolves to nothing. Resolved after
    // mount (there is no DOM during SSR) and left null for the site tier, where
    // Radix's default `<body>` container is correct.
    const [appContainer, setAppContainer] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
      if (tier !== 'app') return;
      setAppContainer(document.querySelector<HTMLElement>('.app-theme'));
    }, [tier]);

    const handleValueChange = React.useCallback(
      (next: string) => {
        const plain = fromItemValue(next);
        const target = { value: plain, name: name ?? '' };
        onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
      },
      [onChange, name],
    );

    const renderOption = (option: OptionNode, key: React.Key) => (
      <SelectPrimitive.Item
        key={key}
        value={toItemValue(option.value)}
        disabled={option.disabled}
        data-slot="select-item"
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center gap-2 py-1.5 pl-2.5 pr-8 outline-none',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          styles.item,
        )}
      >
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );

    return (
      <SelectPrimitive.Root
        value={value === undefined ? undefined : toItemValue(String(value))}
        defaultValue={defaultValue === undefined ? undefined : toItemValue(String(defaultValue))}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
        name={name}
      >
        <span className={cn('relative block', containerClassName)} data-slot="select-control">
          <SelectPrimitive.Trigger
            ref={ref}
            data-slot="select"
            className={cn(
              // Radius and elevation come from the tier's control tokens, like
              // Button/Input/Badge, so a select squares off and swaps its
              // elevation for a hairline ring in the themes that do that.
              'flex w-full cursor-pointer appearance-none items-center justify-between gap-2 transition-all duration-200',
              controlSize === 'sm' ? 'h-8 px-3.5 py-1 pr-8' : 'h-10 px-4 py-2 pr-10',
              'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              // The value can be longer than the control: clip it rather than let
              // it push the chevron out of the box.
              '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate [&>span:first-child]:text-left',
              styles.trigger,
              className,
            )}
            {...props}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon asChild>
              <ChevronDown
                aria-hidden
                className={cn(
                  'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2',
                  styles.chevron,
                )}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal container={appContainer ?? undefined}>
            <SelectPrimitive.Content
              data-slot="select-content"
              position="popper"
              sideOffset={6}
              className={cn(
                // The whole point of the rewrite: the list is one of OUR surfaces,
                // in the theme's own material. `glass-overlay` is the shared
                // floating-panel tier (globals.css §5.1). z-60 clears the z-50
                // dialogs a select can be opened from inside.
                'z-[60] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1',
                styles.content,
              )}
            >
              <SelectPrimitive.ScrollUpButton
                className={cn('flex h-5 items-center justify-center', styles.scrollButton)}
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </SelectPrimitive.ScrollUpButton>

              <SelectPrimitive.Viewport className="p-0.5">
                {/* Keyed by position, not by value: a list is free to repeat a
                    value (or use `''` twice for a placeholder plus an "any" row)
                    and React would then drop one of them. */}
                {nodes.map((node, i) =>
                  node.kind === 'option' ? (
                    renderOption(node, `option-${i}`)
                  ) : (
                    <SelectPrimitive.Group key={`group-${i}`}>
                      <SelectPrimitive.Label
                        className={cn(
                          'px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]',
                          styles.label,
                        )}
                      >
                        {node.label}
                      </SelectPrimitive.Label>
                      {node.options.map((option, j) => renderOption(option, `option-${i}-${j}`))}
                    </SelectPrimitive.Group>
                  ),
                )}
              </SelectPrimitive.Viewport>

              <SelectPrimitive.ScrollDownButton
                className={cn('flex h-5 items-center justify-center', styles.scrollButton)}
              >
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </SelectPrimitive.ScrollDownButton>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </span>
      </SelectPrimitive.Root>
    );
  },
);
Select.displayName = 'Select';

export { Select };
