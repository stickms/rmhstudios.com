// Namespace loaders for "en": every locales/en/*.json present at build time,
// each a lazy import() that Vite emits as its own chunk. The catalogs are
// committed on main.
// A namespace with no file here falls back to English per key at runtime.
import { namespaceMap } from '@/lib/i18n/namespace-map';

export default namespaceMap(import.meta.glob('/locales/en/*.json'));
