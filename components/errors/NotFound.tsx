import { Link } from'@tanstack/react-router';
import { Compass, Home, Search } from'lucide-react';
import { useTranslation } from'react-i18next';

/**
 * Styled, theme-aware, mobile-friendly 404 page used as the root (and site
 * layout) `notFoundComponent`. Monochrome by design so it reads black & white
 * on the default theme and stays consistent with the rest of the site — it
 * uses `site-*`tokens (no accent color) so it also adapts cleanly when it
 * renders inside the app shell. Buttons stack on small screens and sit in a row
 * from `sm`up; the primary action is always"Go home".
 */
export function NotFound() {
 const { t } = useTranslation('common');

 return (
 <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-site-bg px-6 py-16 text-center">
 <div className="bg-site-surface border border-site-border rounded-2xl shadow-xs flex w-full max-w-2xl flex-col items-center gap-9 p-8 sm:p-12">
 <div className="space-y-4">
 <p
 aria-hidden="true"
 className="bg-gradient-to-b from-site-text to-site-text-muted bg-clip-text text-8xl font-bold leading-none tracking-[-0.05em] text-transparent sm:text-9xl"
 >
 404
 </p>
 <h1 className="text-2xl font-bold tracking-tight text-site-text sm:text-3xl">
 {t('notFound.title', { defaultValue:'Page not found'})}
 </h1>
 <p className="mx-auto max-w-md text-sm leading-relaxed text-site-text-muted sm:text-base">
 {t('notFound.body', {
 defaultValue:
"The page you’re looking for doesn’t exist, moved, or never did. Let’s get you back on track.",
 })}
 </p>
 </div>

 <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-xl sm:flex-row sm:justify-center">
 <Link
 to="/"
 className="inline-flex items-center justify-center gap-2 rounded-full bg-site-text px-5 py-3 text-sm font-semibold text-site-bg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-text/25"
 >
 <Home className="size-4"aria-hidden="true"/>
 {t('notFound.home', { defaultValue:'Go home'})}
 </Link>
 <Link
 to="/explore"
 className="inline-flex items-center justify-center gap-2 rounded-full border border-site-border bg-transparent px-5 py-3 text-sm font-semibold text-site-text transition hover:bg-site-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-text/25"
 >
 <Compass className="size-4"aria-hidden="true"/>
 {t('notFound.explore', { defaultValue:'Explore'})}
 </Link>
 <Link
 to="/search"
 search={{ q:'', tab:'top'}}
 className="inline-flex items-center justify-center gap-2 rounded-full border border-site-border bg-transparent px-5 py-3 text-sm font-semibold text-site-text transition hover:bg-site-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-text/25"
 >
 <Search className="size-4"aria-hidden="true"/>
 {t('notFound.search', { defaultValue:'Search'})}
 </Link>
 </div>
 </div>
 </div>
 );
}

export default NotFound;
