// Namespace loaders for "pt": every locales/pt/*.json present at build time,
// each a lazy import() that Vite emits as its own chunk. The catalogs are
// pulled from the `i18n/catalogs` branch by `pnpm i18n:pull` (docs/translations.md).
// A namespace with no file here falls back to English per key at runtime.
import { namespaceMap } from '@/lib/i18n/namespace-map';

export default namespaceMap(import.meta.glob('/locales/pt/*.json'));
