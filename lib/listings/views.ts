/**
 * Client-safe view types for listings (the server side is `lib/listings/*.server.ts`).
 * The storefront shapes are the ones its API has always answered with.
 */
import type { resolveUser } from '@/lib/user-display';

/** A storefront product as the owner's create / update endpoints answer with it. */
export interface StorefrontProductRow {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  price: number;
  deliverable: string | null;
  active: boolean;
  salesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorefrontProductItem {
  id: string;
  title: string;
  description: string | null;
  price: number;
  active: boolean;
  salesCount: number;
  createdAt: string;
  owned: boolean;
  deliverable: string | null;
}

export interface StorefrontResult {
  creator: ReturnType<typeof resolveUser>;
  isOwner: boolean;
  signedIn: boolean;
  products: StorefrontProductItem[];
}
