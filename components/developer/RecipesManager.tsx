'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pause, Play, Trash2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  MAX_RECIPES,
  type RecipeTrigger,
  type RecipeAction,
  type RecipeView,
} from '@/lib/devplatform/recipes';

interface Options {
  games: { id: string; title: string }[];
  items: { id: string; name: string }[];
}

/** D5 — "when X then Y" recipes, on the /developer page. */
export function RecipesManager() {
  const { t } = useTranslation('f-devplatform');
  const [recipes, setRecipes] = useState<RecipeView[] | null>(null);
  const [options, setOptions] = useState<Options>({ games: [], items: [] });
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<RecipeTrigger>('new_follower');
  const [gameId, setGameId] = useState('');
  const [itemId, setItemId] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [action, setAction] = useState<RecipeAction>('dm_self');
  const [discordUrl, setDiscordUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/recipes', { credentials: 'include' });
    if (!res.ok) return setRecipes([]);
    const data = await res.json();
    setRecipes(data.recipes);
    setOptions(data.options);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger,
          gameId: trigger === 'new_pb' ? gameId : undefined,
          itemId: trigger === 'price_below' ? itemId : undefined,
          maxPrice: trigger === 'price_below' ? Number(maxPrice) : undefined,
          action,
          discordUrl: action === 'discord_webhook' ? discordUrl : undefined,
        }),
      });
      if (res.ok) {
        setName('');
        setDiscordUrl('');
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(
          d.error ||
            t('recipes-createFailed', { defaultValue: 'Check the recipe fields and try again' }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: RecipeView) {
    await fetch(`/api/recipes/${r.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !r.enabled }),
    });
    await load();
  }

  async function remove(r: RecipeView) {
    await fetch(`/api/recipes/${r.id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  const ready =
    name.trim() &&
    (trigger !== 'new_pb' || gameId) &&
    (trigger !== 'price_below' || (itemId && Number(maxPrice) > 0)) &&
    (action !== 'discord_webhook' || discordUrl.trim());

  return (
    <section className="space-y-3" aria-labelledby="recipes-heading">
      <div className="flex items-center gap-2">
        <Workflow className="h-4 w-4 text-site-accent" aria-hidden />
        <h2 id="recipes-heading" className="text-sm font-bold text-site-text">
          {t('recipes-title', { defaultValue: 'Recipes' })}
        </h2>
      </div>
      <p className="text-xs text-site-text-muted">
        {t('recipes-blurb', {
          defaultValue:
            'When something happens, do something: post to a Discord channel or notify yourself. Each recipe is rate-limited, and you can keep up to {{max}}.',
          max: MAX_RECIPES,
        })}
      </p>

      <div className="glass-fill space-y-2 rounded-site p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          aria-label={t('recipes-name', { defaultValue: 'Recipe name' })}
          placeholder={t('recipes-name', { defaultValue: 'Recipe name' })}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            id="recipe-trigger"
            aria-label={t('recipes-when', { defaultValue: 'When' })}
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as RecipeTrigger)}
          >
            <option value="new_follower">
              {t('recipes-t-follower', { defaultValue: 'When someone follows me' })}
            </option>
            <option value="new_pb">
              {t('recipes-t-pb', { defaultValue: 'When I set a personal best' })}
            </option>
            <option value="price_below">
              {t('recipes-t-price', { defaultValue: 'When a market item drops below…' })}
            </option>
          </Select>
          <Select
            id="recipe-action"
            aria-label={t('recipes-then', { defaultValue: 'Then' })}
            value={action}
            onChange={(e) => setAction(e.target.value as RecipeAction)}
          >
            <option value="dm_self">{t('recipes-a-notify', { defaultValue: 'Notify me' })}</option>
            <option value="discord_webhook">
              {t('recipes-a-discord', { defaultValue: 'Post to a Discord webhook' })}
            </option>
          </Select>
        </div>
        {trigger === 'new_pb' && (
          <Select
            id="recipe-game"
            aria-label={t('recipes-game', { defaultValue: 'Game' })}
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          >
            <option value="">{t('recipes-pickGame', { defaultValue: 'Pick a game' })}</option>
            {options.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        )}
        {trigger === 'price_below' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              id="recipe-item"
              aria-label={t('recipes-item', { defaultValue: 'Item' })}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">{t('recipes-pickItem', { defaultValue: 'Pick an item' })}</option>
              {options.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={1}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              aria-label={t('recipes-price', { defaultValue: 'Price in coins' })}
              placeholder={t('recipes-price', { defaultValue: 'Price in coins' })}
            />
          </div>
        )}
        {action === 'discord_webhook' && (
          <Input
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            maxLength={300}
            aria-label={t('recipes-discordUrl', { defaultValue: 'Discord webhook URL' })}
            placeholder="https://discord.com/api/webhooks/…"
          />
        )}
        <div className="flex justify-end">
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !ready || (recipes?.length ?? 0) >= MAX_RECIPES}
            onClick={create}
          >
            {t('recipes-create', { defaultValue: 'Add recipe' })}
          </Button>
        </div>
      </div>

      {recipes === null ? (
        <Spinner />
      ) : (
        <ul className="space-y-2">
          {recipes.map((r) => (
            <li key={r.id} className="glass-fill flex items-center gap-3 rounded-site p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-site-text">{r.name}</p>
                <p className="text-xs text-site-text-muted">
                  {r.triggerLabel} → {r.actionLabel}
                </p>
                <p className="text-[11px] text-site-text-dim">
                  {t('recipes-fired', {
                    defaultValue: 'Fired {{count}} times',
                    count: r.fireCount,
                  })}
                  {r.lastError ? ` · ${r.lastError}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => toggle(r)}
                aria-label={
                  r.enabled
                    ? t('recipes-pause', { defaultValue: 'Pause recipe' })
                    : t('recipes-resume', { defaultValue: 'Resume recipe' })
                }
              >
                {r.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(r)}
                aria-label={t('recipes-delete', { defaultValue: 'Delete recipe' })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
