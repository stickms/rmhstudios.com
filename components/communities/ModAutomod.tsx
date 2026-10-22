'use client';

/** N4 — the AutoMod rules builder. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import {
  AUTOMOD_MAX_RULES,
  AUTOMOD_POST_KINDS,
  type AutomodAction,
  type AutomodAppliesTo,
  type AutomodConditions,
  type AutomodPostKind,
} from '@/lib/communities/automod';

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  appliesTo: AutomodAppliesTo;
  action: AutomodAction;
  conditions: AutomodConditions;
}

const splitList = (raw: string) =>
  raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function ModAutomod({ slug }: { slug: string }) {
  const { t } = useTranslation('f-communities-plus');
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [name, setName] = useState('');
  const [action, setAction] = useState<AutomodAction>('hold');
  const [appliesTo, setAppliesTo] = useState<AutomodAppliesTo>('both');
  const [ageDays, setAgeDays] = useState('');
  const [keywords, setKeywords] = useState('');
  const [domains, setDomains] = useState('');
  const [kinds, setKinds] = useState<AutomodPostKind[]>([]);
  const [noAvatar, setNoAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await plusFetch<{ rules: RuleRow[] }>(communityApi(slug, '/automod'));
    setRules(res.data?.rules ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const conditions: AutomodConditions = {
    ...(ageDays && Number(ageDays) > 0 ? { accountAgeLtDays: Math.floor(Number(ageDays)) } : {}),
    ...(splitList(keywords).length ? { keywords: splitList(keywords) } : {}),
    ...(splitList(domains).length ? { linkDomains: splitList(domains) } : {}),
    ...(kinds.length ? { postKinds: kinds } : {}),
    ...(noAvatar ? { noAvatar: true as const } : {}),
  } as AutomodConditions;
  const hasCondition = Object.keys(conditions).length > 0;

  const add = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/automod'), 'POST', {
      name,
      enabled: true,
      appliesTo,
      action,
      conditions,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || t('automod-save-error', { defaultValue: "Couldn't save the rule" }));
      return;
    }
    setName('');
    setAgeDays('');
    setKeywords('');
    setDomains('');
    setKinds([]);
    setNoAvatar(false);
    void load();
  };

  const toggle = async (r: RuleRow, enabled: boolean) => {
    setRules((cur) => cur?.map((x) => (x.id === r.id ? { ...x, enabled } : x)) ?? null);
    const res = await plusFetch(communityApi(slug, `/automod/${r.id}`), 'PATCH', { enabled });
    if (!res.ok) void load();
  };

  const remove = async (r: RuleRow) => {
    setRules((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
    const res = await plusFetch(communityApi(slug, `/automod/${r.id}`), 'DELETE');
    if (!res.ok) void load();
  };

  const describe = (c: AutomodConditions) => {
    const parts: string[] = [];
    if (c.accountAgeLtDays)
      parts.push(
        t('automod-d-age', {
          n: c.accountAgeLtDays,
          defaultValue: 'account younger than {{n}} days',
        }),
      );
    if (c.keywords)
      parts.push(
        t('automod-d-keywords', { list: c.keywords.join(', '), defaultValue: 'contains {{list}}' }),
      );
    if (c.linkDomains)
      parts.push(
        t('automod-d-domains', {
          list: c.linkDomains.join(', '),
          defaultValue: 'links to {{list}}',
        }),
      );
    if (c.postKinds)
      parts.push(
        t('automod-d-kinds', {
          list: c.postKinds.map(kindLabel).join(', '),
          defaultValue: 'post kind {{list}}',
        }),
      );
    if (c.noAvatar) parts.push(t('automod-d-avatar', { defaultValue: 'no profile picture' }));
    return parts.join(' + ');
  };

  const kindLabel = (k: AutomodPostKind) =>
    ({
      text: t('kind-text', { defaultValue: 'Text' }),
      image: t('kind-image', { defaultValue: 'Image' }),
      gif: t('kind-gif', { defaultValue: 'GIF' }),
      poll: t('kind-poll', { defaultValue: 'Poll' }),
      link: t('kind-link', { defaultValue: 'Link' }),
      quote: t('kind-quote', { defaultValue: 'Quote' }),
    })[k];

  const actionLabel = (a: AutomodAction) =>
    a === 'remove'
      ? t('automod-action-remove', { defaultValue: 'Remove' })
      : a === 'hold'
        ? t('automod-action-hold', { defaultValue: 'Hold for review' })
        : t('automod-action-flag', { defaultValue: 'Flag' });

  if (!rules) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-site-text-muted">
        {t('automod-intro', {
          defaultValue:
            'Rules run on every new post and comment from non-mods. A rule matches when all of its conditions do. If several match, the strictest action wins.',
        })}
      </p>
      <ul className="flex flex-col gap-2">
        {rules.map((r) => (
          <li key={r.id} className="glass-fill flex items-start gap-3 p-3">
            <Switch
              checked={r.enabled}
              onCheckedChange={(v) => void toggle(r, v)}
              aria-label={t('automod-enable', {
                name: r.name,
                defaultValue: 'Enable rule {{name}}',
              })}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-site-text">
                {r.name}{' '}
                <span className="text-xs font-normal text-site-text-muted">
                  · {actionLabel(r.action)}
                </span>
              </p>
              <p className="break-words text-xs text-site-text-muted">{describe(r.conditions)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('automod-delete', { defaultValue: 'Delete rule' })}
              onClick={() => void remove(r)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <form
        className="glass-pane flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <h3 className="text-sm font-semibold text-site-text">
          {t('automod-new', {
            count: rules.length,
            max: AUTOMOD_MAX_RULES,
            defaultValue: 'New rule ({{count}} of {{max}})',
          })}
        </h3>
        <Input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('automod-name-ph', { defaultValue: 'Rule name' })}
          aria-label={t('automod-name-ph', { defaultValue: 'Rule name' })}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-site-text-muted">
            {t('automod-action', { defaultValue: 'Then' })}
            <Select value={action} onChange={(e) => setAction(e.target.value as AutomodAction)}>
              <option value="flag">
                {t('automod-action-flag-full', {
                  defaultValue: 'Flag it for review (stays visible)',
                })}
              </option>
              <option value="hold">
                {t('automod-action-hold-full', {
                  defaultValue: 'Hold it for review (hidden until approved)',
                })}
              </option>
              <option value="remove">
                {t('automod-action-remove-full', { defaultValue: 'Remove it' })}
              </option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-site-text-muted">
            {t('automod-applies', { defaultValue: 'Applies to' })}
            <Select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as AutomodAppliesTo)}
            >
              <option value="both">
                {t('automod-applies-both', { defaultValue: 'Posts and comments' })}
              </option>
              <option value="posts">
                {t('automod-applies-posts', { defaultValue: 'Posts only' })}
              </option>
              <option value="comments">
                {t('automod-applies-comments', { defaultValue: 'Comments only' })}
              </option>
            </Select>
          </label>
        </div>
        <p className="text-xs font-semibold text-site-text">
          {t('automod-when', { defaultValue: 'When all of these match' })}
        </p>
        <label className="flex flex-col gap-1 text-xs text-site-text-muted">
          {t('automod-age', { defaultValue: 'Account is younger than (days)' })}
          <Input
            type="number"
            min={1}
            max={3650}
            value={ageDays}
            onChange={(e) => setAgeDays(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-site-text-muted">
          {t('automod-keywords', {
            defaultValue: 'Contains any keyword (comma or line separated)',
          })}
          <Textarea rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-site-text-muted">
          {t('automod-domains', { defaultValue: 'Links to any of these domains' })}
          <Textarea rows={2} value={domains} onChange={(e) => setDomains(e.target.value)} />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs text-site-text-muted">
            {t('automod-kinds', { defaultValue: 'Post is one of these kinds' })}
          </legend>
          <div className="flex flex-wrap gap-3">
            {AUTOMOD_POST_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-site-text">
                <input
                  type="checkbox"
                  checked={kinds.includes(k)}
                  onChange={() =>
                    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
                  }
                  className="accent-[var(--site-accent)]"
                />
                {kindLabel(k)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-sm text-site-text">
          <Switch checked={noAvatar} onCheckedChange={setNoAvatar} />
          {t('automod-no-avatar', { defaultValue: 'Author has no profile picture' })}
        </label>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="accent"
            size="sm"
            loading={saving}
            disabled={!name.trim() || !hasCondition || rules.length >= AUTOMOD_MAX_RULES}
          >
            {t('automod-add', { defaultValue: 'Add rule' })}
          </Button>
        </div>
      </form>
    </div>
  );
}
