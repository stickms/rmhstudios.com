/**
 * Blocks — groups of panels edited together. Make one from the selection, from a built-in grouping
 * (the charge and effect meters, say) or from panels that look alike; then set the look once, and
 * align or space the group as a unit. A panel that should differ overrides one value and says so;
 * the block never silently rewrites it.
 */
'use client';

import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  Boxes,
  ChevronDown,
  ChevronRight,
  Columns3,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { orphansOf } from '@/lib/tf2-hud/blocks/apply';
import {
  addBlockKey,
  applyBlockKey,
  addToBlock,
  arrangeNodes,
  createBlock,
  createFromPreset,
  createFromSuggestion,
  currentDrift,
  deleteBlock,
  nodesOfBlock,
  reapplyBlock,
  refreshFromRule,
  removeBlockKey,
  removeFromBlock,
  renameBlock,
  resolveDrift,
  resetOverride,
  setBlockValue,
  toMember,
  useBlocksDoc,
  type ArrangeOp,
} from '@/lib/tf2-hud/blocks/actions';
import { BLOCK_PRESETS } from '@/lib/tf2-hud/blocks/presets';
import { suggestSimilar } from '@/lib/tf2-hud/blocks/suggest';
import {
  memberKey,
  SHARABLE_KEYS,
  sameMember,
  type Block,
  type BlockMember,
} from '@/lib/tf2-hud/blocks/types';
import { setSchemeColor } from '@/lib/tf2-hud/scheme/edit';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { PropControl } from './PropControl';
import { useSceneContext } from './scene-context';
import {
  Btn,
  EmptyNote,
  IconBtn,
  NumberField,
  PanelHead,
  Pill,
  SelectField,
  TextField,
} from './ui';

export default function BlocksPanel() {
  const { t } = useTranslation('c-tf2-hud');
  const { scene, scheme } = useSceneContext();
  const doc = useBlocksDoc();
  const selectedIds = useEditor((s) => s.selectedIds);
  const selectedId = useEditor((s) => s.selectedId);
  const focusedId = useEditor((s) => s.focusedBlockId);
  const focusBlock = useEditor((s) => s.focusBlock);
  const view = useEditor((s) => s.view);
  const readText = useEditor((s) => s.readText);
  const [name, setName] = useState('');
  const [gap, setGap] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);

  const opts = useMemo(
    () => ({ env: COND_ENVS[view.env], minmode: view.minmode }),
    [view.env, view.minmode],
  );
  const io = useMemo(() => ({ read: readText }), [readText]);

  const picked = useMemo(() => {
    const ids = new Set(selectedIds);
    if (selectedId) ids.add(selectedId);
    return scene?.nodes.filter((n) => ids.has(n.id)) ?? [];
  }, [scene, selectedIds, selectedId]);
  const focused = doc.blocks.find((b) => b.id === focusedId);
  const arrangeTargets = picked.length >= 2 ? picked : nodesOfBlock(focused ?? EMPTY_BLOCK, scene);

  const suggestions = useMemo(
    () => (scene ? suggestSimilar(scene, io, opts, doc.blocks) : []),
    [scene, io, opts, doc.blocks],
  );
  const presets = BLOCK_PRESETS.filter((p) => !doc.blocks.some((b) => b.preset === p.id));

  const report = (made: { block?: Block; skipped: number }, label: string) => {
    if (!made.block) {
      toast.info(
        t('block-none', {
          defaultValue: 'Nothing to group: those panels are already in other blocks, or not found.',
        }),
      );
    } else if (made.skipped) {
      toast.info(
        t('block-skipped', {
          defaultValue_one:
            '{{label}}: {{count}} panel was already in another block and was left out.',
          defaultValue_other:
            '{{label}}: {{count}} panels were already in another block and were left out.',
          label,
          count: made.skipped,
        }),
      );
    }
  };

  const arrange = (op: ArrangeOp) => {
    if (scene && arrangeTargets.length >= 2) arrangeNodes(arrangeTargets, scene, op);
  };

  const ARRANGE: { icon: typeof Boxes; label: string; op: ArrangeOp }[] = [
    {
      icon: AlignHorizontalJustifyStart,
      label: t('align-left', { defaultValue: 'Align left' }),
      op: { kind: 'align', mode: 'left' },
    },
    {
      icon: AlignHorizontalJustifyCenter,
      label: t('align-center-h', { defaultValue: 'Centre horizontally' }),
      op: { kind: 'align', mode: 'centerH' },
    },
    {
      icon: AlignHorizontalJustifyEnd,
      label: t('align-right', { defaultValue: 'Align right' }),
      op: { kind: 'align', mode: 'right' },
    },
    {
      icon: AlignVerticalJustifyStart,
      label: t('align-top', { defaultValue: 'Align top' }),
      op: { kind: 'align', mode: 'top' },
    },
    {
      icon: AlignVerticalJustifyCenter,
      label: t('align-center-v', { defaultValue: 'Centre vertically' }),
      op: { kind: 'align', mode: 'centerV' },
    },
    {
      icon: AlignVerticalJustifyEnd,
      label: t('align-bottom', { defaultValue: 'Align bottom' }),
      op: { kind: 'align', mode: 'bottom' },
    },
    {
      icon: AlignHorizontalSpaceBetween,
      label: t('distribute-h', { defaultValue: 'Space evenly across' }),
      op: { kind: 'distribute', axis: 'x' },
    },
    {
      icon: AlignVerticalSpaceBetween,
      label: t('distribute-v', { defaultValue: 'Space evenly down' }),
      op: { kind: 'distribute', axis: 'y' },
    },
    {
      icon: Columns3,
      label: t('stack-h', { defaultValue: 'Line up in a row with the gap' }),
      op: { kind: 'stack', axis: 'x', gap },
    },
    {
      icon: Rows3,
      label: t('stack-v', { defaultValue: 'Line up in a column with the gap' }),
      op: { kind: 'stack', axis: 'y', gap },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead title={t('blocks', { defaultValue: 'Blocks' })} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-6 pt-3">
        <section
          aria-label={t('block-selection', { defaultValue: 'Selection' })}
          className="space-y-2"
        >
          <p className="text-xs text-(--app-text-muted)">
            {picked.length
              ? t('block-selected', {
                  defaultValue_one:
                    '{{count}} selected. Shift-click or Shift-drag in the preview to add more.',
                  defaultValue_other:
                    '{{count}} selected. Shift-click or Shift-drag in the preview to add more.',
                  count: picked.length,
                })
              : t('block-select-hint', {
                  defaultValue:
                    'Shift-click panels in the preview, or Shift-drag a box round them, then make a block.',
                })}
          </p>
          <div className="flex items-center gap-1.5">
            <TextField
              aria-label={t('block-name', { defaultValue: 'Block name' })}
              placeholder={t('block-name-ph', { defaultValue: 'Block name' })}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Btn
              size="sm"
              icon={Boxes}
              disabled={picked.length === 0}
              onClick={() => {
                const label = name.trim() || t('block-default-name', { defaultValue: 'New block' });
                report(createBlock(label, picked.map(toMember)), label);
                setName('');
              }}
            >
              {t('make-block', { defaultValue: 'Make block' })}
            </Btn>
          </div>
          {focused && picked.length ? (
            <Btn
              size="xs"
              icon={Plus}
              onClick={() => {
                const n = addToBlock(focused.id, picked.map(toMember));
                if (n)
                  toast.info(
                    t('block-added', {
                      defaultValue_one:
                        'Added {{count}} panel to "{{name}}". It took on the block’s look; undo reverts that.',
                      defaultValue_other:
                        'Added {{count}} panels to "{{name}}". They took on the block’s look; undo reverts that.',
                      count: n,
                      name: focused.name,
                    }),
                  );
              }}
            >
              {t('add-to-block', {
                defaultValue: 'Add selection to "{{name}}"',
                name: focused.name,
              })}
            </Btn>
          ) : null}
        </section>

        <section
          aria-label={t('block-arrange', { defaultValue: 'Arrange' })}
          className="space-y-1.5"
        >
          <h3 className="tf2hud-panel-head">{t('block-arrange', { defaultValue: 'Arrange' })}</h3>
          <p className="text-[11px] text-(--app-text-dim)">
            {arrangeTargets.length >= 2
              ? t('arrange-target', {
                  defaultValue_one: 'Acts on {{count}} panel on this page.',
                  defaultValue_other: 'Acts on {{count}} panels on this page.',
                  count: arrangeTargets.length,
                })
              : t('arrange-none', {
                  defaultValue:
                    'Select two or more panels, or open a block that has panels on this page.',
                })}
          </p>
          <div className="flex flex-wrap items-center gap-0.5">
            {ARRANGE.map(({ icon, label, op }) => (
              <IconBtn
                key={label}
                icon={icon}
                label={label}
                size="xs"
                disabled={arrangeTargets.length < 2}
                onClick={() => arrange(op)}
              />
            ))}
            <span className="ms-2 text-[11px] text-(--app-text-dim)">
              {t('arrange-gap', { defaultValue: 'Gap' })}
            </span>
            <NumberField
              label={t('arrange-gap-label', { defaultValue: 'Gap between panels' })}
              value={gap}
              min={0}
              max={200}
              onChange={setGap}
              className="ms-1 w-14"
            />
          </div>
        </section>

        {presets.length || suggestions.length ? (
          <section
            aria-label={t('block-suggestions', { defaultValue: 'Suggestions' })}
            className="space-y-1.5"
          >
            <h3 className="tf2hud-panel-head">
              {t('block-suggestions', { defaultValue: 'Suggestions' })}
            </h3>
            {suggestions.map((sug) => (
              <div key={sug.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs">
                  {sug.name}
                  <span className="text-(--app-text-dim)">
                    {' '}
                    · {t('looks-alike', { defaultValue: 'look alike, near each other' })}
                  </span>
                </span>
                <Btn size="xs" onClick={() => report(createFromSuggestion(sug), sug.name)}>
                  {t('create', { defaultValue: 'Create' })}
                </Btn>
              </div>
            ))}
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-xs" title={p.description}>
                  <span className="truncate">{p.name}</span>
                  <span className="block truncate text-[11px] text-(--app-text-dim)">
                    {p.description}
                  </span>
                </span>
                <Btn
                  size="xs"
                  disabled={busy === p.id}
                  onClick={async () => {
                    setBusy(p.id);
                    try {
                      report(await createFromPreset(p.id), p.name);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.id
                    ? t('finding', { defaultValue: 'Finding…' })
                    : t('create', { defaultValue: 'Create' })}
                </Btn>
              </div>
            ))}
          </section>
        ) : null}

        <section
          aria-label={t('your-blocks', { defaultValue: 'Your blocks' })}
          className="space-y-1.5"
        >
          <h3 className="tf2hud-panel-head">{t('your-blocks', { defaultValue: 'Your blocks' })}</h3>
          {doc.blocks.length === 0 ? (
            <EmptyNote>
              {t('no-blocks', {
                defaultValue:
                  'No blocks yet. Group panels that should look the same, like all the charge bars.',
              })}
            </EmptyNote>
          ) : (
            doc.blocks.map((b) => (
              <BlockCard
                key={b.id}
                block={b}
                open={focusedId === b.id}
                onToggle={() => focusBlock(focusedId === b.id ? null : b.id)}
                scheme={scheme}
                screenH={scene?.screen.h ?? 1080}
                opts={opts}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

/** How many panel-by-panel differences to list before summarising the rest. */
const DRIFT_ROWS = 6;

const EMPTY_BLOCK: Block = { id: '', name: '', members: [], shared: {} };

function BlockCard({
  block,
  open,
  onToggle,
  scheme,
  screenH,
  opts,
}: {
  block: Block;
  open: boolean;
  onToggle: () => void;
  scheme: ReturnType<typeof useSceneContext>['scheme'];
  screenH: number;
  opts: { env: (typeof COND_ENVS)[keyof typeof COND_ENVS]; minmode: boolean };
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { scene } = useSceneContext();
  const select = useEditor((s) => s.select);
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const [adding, setAdding] = useState('');
  const [finding, setFinding] = useState(false);

  const onPage = nodesOfBlock(block, scene);
  const io = { read: readText };
  const drift = open ? currentDrift(block.id) : [];
  const orphans = open ? orphansOf(block, io, opts) : [];
  const keys = SHARABLE_KEYS.filter((k) => k in block.shared);
  const driftCount = new Map<string, number>();
  for (const d of drift) driftCount.set(d.key, (driftCount.get(d.key) ?? 0) + 1);
  const addable = SHARABLE_KEYS.filter((k) => !(k in block.shared));
  const shortName = (m: BlockMember) => m.path[m.path.length - 1];

  const writeScheme = (name: string, literal: string) => {
    const text = readText('resource/clientscheme.res');
    if (text !== undefined)
      writeText('resource/clientscheme.res', setSchemeColor(text, name, literal));
  };

  return (
    <div className="rounded-(--app-radius-sm) border border-(--app-border)">
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-start"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <span className="truncate text-xs font-semibold">{block.name}</span>
          <Pill>
            {t('block-count', {
              defaultValue_one: '{{count}} panel',
              defaultValue_other: '{{count}} panels',
              count: block.members.length,
            })}
          </Pill>
          {drift.length ? (
            <Pill tone="warning">
              {t('block-drift-short', {
                defaultValue_one: '{{count}} differs',
                defaultValue_other: '{{count}} differ',
                count: drift.length,
              })}
            </Pill>
          ) : null}
        </button>
        <IconBtn
          icon={RefreshCw}
          label={t('block-apply', { defaultValue: 'Write the block into every panel again' })}
          size="xs"
          onClick={() => reapplyBlock(block.id)}
        />
        <IconBtn
          icon={Trash2}
          label={t('block-delete', { defaultValue: 'Delete block (panels keep their values)' })}
          size="xs"
          onClick={() => deleteBlock(block.id)}
        />
      </div>

      {open ? (
        <div className="space-y-3 border-t border-(--app-border) p-2">
          <TextField
            aria-label={t('block-name', { defaultValue: 'Block name' })}
            value={block.name}
            onChange={(e) => renameBlock(block.id, e.target.value)}
          />

          <div className="space-y-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)">
              {t('shared-values', { defaultValue: 'Shared values' })}
            </h4>
            {keys.length === 0 ? (
              <p className="text-[11px] text-(--app-text-dim)">
                {t('shared-none', {
                  defaultValue:
                    'Nothing is shared yet. Add a property to set it on every panel at once.',
                })}
              </p>
            ) : null}
            {keys.map((key) => (
              <div
                key={key}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2"
              >
                <span className="truncate text-xs text-(--app-text-muted)" title={key}>
                  {key}
                </span>
                <PropControl
                  propKey={key}
                  value={block.shared[key]}
                  onChange={(v) => setBlockValue(block.id, key, v)}
                  scheme={scheme}
                  screenH={screenH}
                  onCreateSchemeColor={writeScheme}
                />
                <IconBtn
                  icon={X}
                  size="xs"
                  label={t('stop-sharing', { defaultValue: 'Stop sharing {{key}}', key })}
                  onClick={() => removeBlockKey(block.id, key)}
                />
                {driftCount.get(key) ? (
                  <div className="col-span-3 flex items-center justify-between gap-2 ps-[7rem] text-[11px] text-(--app-warning)">
                    <span>
                      {t('key-differs', {
                        defaultValue_one: '{{count}} panel has a different value',
                        defaultValue_other: '{{count}} panels have a different value',
                        count: driftCount.get(key),
                      })}
                    </span>
                    <Btn size="xs" onClick={() => applyBlockKey(block.id, key)}>
                      {t('apply-to-all', { defaultValue: 'Apply to all' })}
                    </Btn>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1">
              <SelectField
                aria-label={t('share-property-label', { defaultValue: 'Share a property' })}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              >
                <option value="">
                  {t('share-property', { defaultValue: 'Share a property…' })}
                </option>
                {addable.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </SelectField>
              <Btn
                size="sm"
                icon={Plus}
                disabled={!adding}
                onClick={() => {
                  addBlockKey(block.id, adding);
                  setAdding('');
                }}
              >
                {t('add', { defaultValue: 'Add' })}
              </Btn>
            </div>
          </div>

          {drift.length ? (
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-(--app-warning)">
                {t('block-differs', { defaultValue: 'Differs from the block' })}
              </h4>
              {drift.slice(0, DRIFT_ROWS).map((d) => (
                <div key={`${memberKey(d.member)}:${d.key}`} className="space-y-1 text-xs">
                  <p className="truncate">
                    <strong>{shortName(d.member)}</strong> · {d.key}:{' '}
                    <span className="text-(--app-text-muted)">
                      {d.actual ?? t('unset', { defaultValue: '(not set)' })} → {d.expected}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {d.actual !== undefined ? (
                      <Btn size="xs" onClick={() => resolveDrift(block.id, d, 'block')}>
                        {t('drift-adopt', { defaultValue: 'Use for all' })}
                      </Btn>
                    ) : null}
                    <Btn size="xs" onClick={() => resolveDrift(block.id, d, 'override')}>
                      {t('drift-keep', { defaultValue: 'Keep as override' })}
                    </Btn>
                    <Btn size="xs" onClick={() => resolveDrift(block.id, d, 'revert')}>
                      {t('drift-restore', { defaultValue: 'Restore block value' })}
                    </Btn>
                  </div>
                </div>
              ))}
              {drift.length > DRIFT_ROWS ? (
                <p className="text-[11px] text-(--app-text-dim)">
                  {t('drift-more', {
                    defaultValue_one: '…and {{count}} more',
                    defaultValue_other: '…and {{count}} more',
                    count: drift.length - DRIFT_ROWS,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)">
              {t('block-members', { defaultValue: 'Panels' })}
              <span className="ms-1 font-normal normal-case">
                {t('on-this-page', {
                  defaultValue: '({{count}} on this page)',
                  count: onPage.length,
                })}
              </span>
            </h4>
            {block.members.map((m) => {
              const node = onPage.find((n) => sameMember(m, { file: n.file, path: n.keyPath }));
              const missing = orphans.some((o) => sameMember(o, m));
              return (
                <div key={memberKey(m)} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!node}
                    onClick={() => node && select(node.id)}
                    className={cn(
                      'min-w-0 flex-1 truncate text-start text-xs',
                      node ? 'hover:underline' : 'text-(--app-text-dim)',
                    )}
                    title={`${m.file} › ${m.path.join(' › ')}`}
                  >
                    {shortName(m)}
                    <span className="text-(--app-text-dim)">
                      {' '}
                      · {m.file.replace('resource/ui/', '')}
                    </span>
                  </button>
                  {missing ? (
                    <Pill tone="danger">{t('member-missing', { defaultValue: 'missing' })}</Pill>
                  ) : null}
                  {m.pinned.map((k) => (
                    <button
                      key={k}
                      type="button"
                      title={t('override-reset', {
                        defaultValue: 'Overrides the block. Click to follow the block again.',
                      })}
                      onClick={() => resetOverride(block.id, m, k)}
                    >
                      <Pill tone="info">{k}</Pill>
                    </button>
                  ))}
                  <IconBtn
                    icon={X}
                    size="xs"
                    label={t('remove-from-block', {
                      defaultValue: 'Remove this panel from the block',
                    })}
                    onClick={() => removeFromBlock(block.id, m)}
                  />
                </div>
              );
            })}
            {block.rule ? (
              <Btn
                size="xs"
                icon={Search}
                disabled={finding}
                onClick={async () => {
                  setFinding(true);
                  try {
                    const n = await refreshFromRule(block.id);
                    toast.info(
                      n
                        ? t('found-more', {
                            defaultValue_one: 'Added {{count}} panel.',
                            defaultValue_other: 'Added {{count}} panels.',
                            count: n,
                          })
                        : t('found-none', { defaultValue: 'No new panels found.' }),
                    );
                  } finally {
                    setFinding(false);
                  }
                }}
              >
                {t('find-more', { defaultValue: 'Find more panels' })}
              </Btn>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
