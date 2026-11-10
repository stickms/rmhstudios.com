/**
 * Contracts for the creator-storefront endpoints (redesign audit C1, batch 8):
 * a creator's storefront and the owner's product create / update / delete. Buying
 * (`.../buy`) answers through `StorefrontError` with bespoke bodies and stays raw.
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { StorefrontResult } from '@/lib/storefront.server';

/** A creator's storefront, by handle or id. 404 when unknown. Deliverables only for the owner or buyers. */
export const getStorefrontApi = endpoint<{
  params: { userid: string };
  res: StorefrontResult;
}>()({ method: 'GET', path: '/api/storefront/creator/$userid' });

/** The created product (201). At most 30 per creator. */
export const createStorefrontProductApi = endpoint<{
  body: {
    title: string;
    description?: string | undefined;
    price: number;
    deliverable?: string | undefined;
  };
  res: { id: string };
}>()({ method: 'POST', path: '/api/storefront/products' });

/** Owner only; returns the updated product. */
export const updateStorefrontProductApi = endpoint<{
  params: { id: string };
  body: {
    title?: string | undefined;
    description?: string | null | undefined;
    price?: number | undefined;
    deliverable?: string | null | undefined;
    active?: boolean | undefined;
  };
  res: { id: string; active: boolean };
}>()({ method: 'PATCH', path: '/api/storefront/products/$id' });

/** Owner only. */
export const deleteStorefrontProductApi = endpoint<{
  params: { id: string };
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/storefront/products/$id' });
