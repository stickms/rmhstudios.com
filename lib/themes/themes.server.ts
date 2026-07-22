/**
 * Theme Studio — server logic (§14). Theme CRUD, publish gate, purchase
 * (storefront ledger pattern → creator earnings), and the shop shelf.
 * Ownership rides UserInventory (kind THEME, itemId "user:<themeId>").
 *
 * **Member gate (§14.2):** creating/updating/publishing a theme requires an
 * active membership — the same Stripe-subscription check the rest of the economy
 * uses (`getUserTier` !== 'free'). Buying stays open to anyone with coins.
 */
import { prisma } from '@/lib/prisma.server';
import {
  themeTokensSchema,
  canPublish,
  upcastTokens,
  readTokens,
  THEME_PRICE_MIN,
  THEME_PRICE_MAX,
  type ThemeTokens,
  type UserThemeView,
} from '@/lib/themes/tokens';
import { getUserTier } from '@/lib/entitlements';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

const FEE_RATE = 0.1; // 10% burned, mirrors storefront

export class ThemeError extends Error {}

const inventoryItemId = (themeId: string) => `user:${themeId}`;

function parseTokens(raw: unknown): ThemeTokens {
  const parsed = themeTokensSchema.safeParse(raw);
  if (!parsed.success) throw new ThemeError('INVALID_TOKENS');
  return parsed.data;
}

/**
 * Members-only gate for authoring (create/update/publish). Uses the shared
 * entitlement resolver — any active paid tier counts; free does not (§14.2).
 */
export async function requireMember(userId: string): Promise<void> {
  const tier = await getUserTier(userId).catch(() => 'free' as const);
  if (tier === 'free') throw new ThemeError('MEMBERS_ONLY');
}

export async function listMyThemes(authorId: string): Promise<UserThemeView[]> {
  const rows = await prisma.userTheme.findMany({
    where: { authorId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, tokens: true, status: true, priceCoins: true, sales: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    tokens: readTokens(r.tokens), // v1 rows upcast to v2 on read (§14.1)
    status: String(r.status),
    priceCoins: r.priceCoins,
    sales: r.sales,
    isAuthor: true,
  }));
}

export async function getTheme(id: string, viewerId: string | null): Promise<UserThemeView | null> {
  const t = await prisma.userTheme.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      name: true,
      tokens: true,
      status: true,
      priceCoins: true,
      sales: true,
      author: { select: userDisplaySelect },
    },
  });
  if (!t) return null;
  const isAuthor = viewerId === t.authorId;
  if (t.status === 'DRAFT' && !isAuthor) return null;
  const owned = viewerId ? await isOwned(viewerId, id) : false;
  const a = resolveUser(t.author);
  return {
    id: t.id,
    name: t.name,
    tokens: readTokens(t.tokens),
    status: String(t.status),
    priceCoins: t.priceCoins,
    sales: t.sales,
    author: { name: a.name, handle: a.handle },
    owned,
    isAuthor,
  };
}

async function isOwned(userId: string, themeId: string): Promise<boolean> {
  const row = await prisma.userInventory.findFirst({
    where: { userId, itemId: inventoryItemId(themeId) },
    select: { id: true },
  });
  return !!row;
}

export async function createTheme(authorId: string, name: string, tokens: unknown): Promise<string> {
  await requireMember(authorId);
  const valid = parseTokens(tokens);
  const count = await prisma.userTheme.count({ where: { authorId } });
  if (count >= 50) throw new ThemeError('LIMIT');
  const theme = await prisma.userTheme.create({
    data: { authorId, name, tokens: valid as object },
    select: { id: true },
  });
  return theme.id;
}

export async function updateTheme(
  authorId: string,
  id: string,
  data: { name?: string; tokens?: unknown },
): Promise<void> {
  await requireMember(authorId);
  const theme = await prisma.userTheme.findUnique({ where: { id }, select: { authorId: true, status: true } });
  if (!theme) throw new ThemeError('NOT_FOUND');
  if (theme.authorId !== authorId) throw new ThemeError('FORBIDDEN');
  // Published token maps are immutable (buyers snapshot legibility); name/price stay editable.
  if (data.tokens !== undefined && theme.status !== 'DRAFT') throw new ThemeError('IMMUTABLE');
  const patch: { name?: string; tokens?: object } = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.tokens !== undefined) patch.tokens = parseTokens(data.tokens) as object;
  await prisma.userTheme.update({ where: { id }, data: patch });
}

export async function deleteOrDelistTheme(authorId: string, id: string): Promise<void> {
  const theme = await prisma.userTheme.findUnique({ where: { id }, select: { authorId: true, status: true } });
  if (!theme) throw new ThemeError('NOT_FOUND');
  if (theme.authorId !== authorId) throw new ThemeError('FORBIDDEN');
  if (theme.status === 'DRAFT') await prisma.userTheme.delete({ where: { id } });
  else await prisma.userTheme.update({ where: { id }, data: { status: 'DELISTED' } });
}

export async function publishTheme(authorId: string, id: string, priceCoins: number): Promise<void> {
  await requireMember(authorId);
  if (priceCoins < THEME_PRICE_MIN || priceCoins > THEME_PRICE_MAX) throw new ThemeError('PRICE_RANGE');
  const theme = await prisma.userTheme.findUnique({ where: { id }, select: { authorId: true, tokens: true } });
  if (!theme) throw new ThemeError('NOT_FOUND');
  if (theme.authorId !== authorId) throw new ThemeError('FORBIDDEN');
  // Upcast v1 drafts before the gate; the gate is pure math on v2 token values.
  if (!canPublish(upcastTokens(theme.tokens))) throw new ThemeError('CONTRAST_GATE');
  await prisma.userTheme.update({ where: { id }, data: { status: 'PUBLISHED', priceCoins } });
}

export interface BuyResult {
  balance: number;
}

export async function buyTheme(buyerId: string, id: string): Promise<BuyResult> {
  const theme = await prisma.userTheme.findUnique({
    where: { id },
    select: { authorId: true, status: true, priceCoins: true, name: true },
  });
  if (!theme || theme.status !== 'PUBLISHED' || theme.priceCoins == null) throw new ThemeError('NOT_FOR_SALE');
  if (theme.authorId === buyerId) throw new ThemeError('OWN_THEME');
  if (await isOwned(buyerId, id)) throw new ThemeError('ALREADY_OWNED');

  const price = theme.priceCoins;
  const payout = price - Math.floor(price * FEE_RATE);

  return prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({ where: { userId: buyerId }, create: { userId: buyerId, coins: 10 }, update: {} });
    const debit = await tx.userProfile.updateMany({
      where: { userId: buyerId, coins: { gte: price } },
      data: { coins: { decrement: price } },
    });
    if (debit.count === 0) throw new ThemeError('INSUFFICIENT_COINS');
    const buyer = await tx.userProfile.findUnique({ where: { userId: buyerId }, select: { coins: true } });
    await tx.userProfile.upsert({
      where: { userId: theme.authorId },
      create: { userId: theme.authorId, coins: 10 + payout },
      update: { coins: { increment: payout } },
    });
    await tx.userInventory.upsert({
      where: { userId_itemId: { userId: buyerId, itemId: inventoryItemId(id) } },
      create: { userId: buyerId, itemId: inventoryItemId(id), kind: 'THEME' },
      update: {},
    });
    await tx.userTheme.update({ where: { id }, data: { sales: { increment: 1 } } });
    await tx.coinTransaction.createMany({
      data: [
        {
          senderId: buyerId,
          recipientId: theme.authorId,
          amount: payout,
          type: 'PURCHASE',
          entityType: 'user_theme',
          entityId: id,
          note: `Theme: ${theme.name}`,
        },
        {
          recipientId: buyerId,
          amount: -price,
          type: 'PURCHASE',
          entityType: 'user_theme',
          entityId: id,
          note: `Theme: ${theme.name}`,
        },
      ],
    });
    return { balance: buyer?.coins ?? 0 };
  });
}

/** Themes the viewer owns (bought or authored) — the inventory shelf (§14.2). */
export async function listOwnedThemes(userId: string): Promise<UserThemeView[]> {
  const rows = await prisma.userInventory.findMany({
    where: { userId, kind: 'THEME' },
    select: { itemId: true },
  });
  const ids = rows.map((r) => r.itemId.replace(/^user:/, '')).filter(Boolean);
  if (ids.length === 0) return [];
  const themes = await prisma.userTheme.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      tokens: true,
      status: true,
      priceCoins: true,
      sales: true,
      author: { select: userDisplaySelect },
    },
  });
  return themes.map((r) => {
    const a = resolveUser(r.author);
    return {
      id: r.id,
      name: r.name,
      tokens: readTokens(r.tokens),
      status: String(r.status),
      priceCoins: r.priceCoins,
      sales: r.sales,
      author: { name: a.name, handle: a.handle },
      owned: true,
    };
  });
}

export async function listShop(sort: 'top' | 'new' = 'top'): Promise<UserThemeView[]> {
  const rows = await prisma.userTheme.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: sort === 'new' ? { createdAt: 'desc' } : { sales: 'desc' },
    take: 60,
    select: {
      id: true,
      name: true,
      tokens: true,
      priceCoins: true,
      sales: true,
      author: { select: userDisplaySelect },
    },
  });
  return rows.map((r) => {
    const a = resolveUser(r.author);
    return {
      id: r.id,
      name: r.name,
      tokens: readTokens(r.tokens),
      status: 'PUBLISHED',
      priceCoins: r.priceCoins,
      sales: r.sales,
      author: { name: a.name, handle: a.handle },
    };
  });
}
