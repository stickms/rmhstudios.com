import type {
  CachedHome,
  HomeStore,
} from '../home-store';

/** Seeds one entry in a test (production writes always go through `transact`). */
export const putEntry =
  (
    store: HomeStore,
    key: string,
    value: CachedHome,
  ) =>
    store.transact(
      [
        {
          key,
          put: value,
        },
      ],
    );
