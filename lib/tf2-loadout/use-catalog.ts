/**
 * The item catalog in the browser: one fetch per page load (the browser's HTTP
 * cache and the route's ETag make repeat visits a 304), shared by every
 * component, with lookup maps built once.
 */
'use client';

import { useEffect, useState } from 'react';
import { loadoutApi } from './api';
import type { Catalog, CatalogEffect, CatalogItem, CatalogPaint } from './catalog-types';

export interface CatalogIndex {
  catalog: Catalog;
  item(id: number): CatalogItem | undefined;
  paint(id: number): CatalogPaint | undefined;
  effect(id: number): CatalogEffect | undefined;
}

function index(catalog: Catalog): CatalogIndex {
  const items = new Map(catalog.items.map((i) => [i.id, i]));
  const paints = new Map(catalog.paints.map((p) => [p.id, p]));
  const effects = new Map(catalog.effects.map((e) => [e.id, e]));
  return {
    catalog,
    item: (id) => items.get(id),
    paint: (id) => paints.get(id),
    effect: (id) => effects.get(id),
  };
}

let pending: Promise<CatalogIndex> | null = null;

export function loadCatalog(): Promise<CatalogIndex> {
  pending ??= loadoutApi.catalog().then(index);
  // A failed load must not poison later attempts.
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

export type CatalogState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; index: CatalogIndex };

export function useCatalog(): CatalogState & { retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loadCatalog().then(
      (idx) => alive && setState({ status: 'ready', index: idx }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
