import { Link } from'@tanstack/react-router';
import { Compass, Home } from'lucide-react';
import { Button } from '@/components/ui/button';
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
 <div className="error-page flex min-h-dvh w-full flex-col items-center justify-center bg-site-bg px-6 py-16 text-center">
 <div className="glass-pane flex w-full max-w-2xl flex-col items-center gap-8 p-8 sm:p-12">
 <div className="space-y-3">
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
 <Button asChild variant="accent" size="lg">
 <Link to="/">
 <Home aria-hidden="true"/>
 {t('notFound.home', { defaultValue:'Go home'})}
 </Link>
 </Button>
 {/* One link, because Explore and Search are one page now: this used to
 offer both, side by side, which was the clearest symptom of the split
 — two buttons, two icons, same destination's worth of content. */}
 <Button asChild variant="outline" size="lg">
 <Link to="/explore" search={{ q:'', tab:'top'}}>
 <Compass aria-hidden="true"/>
 {t('notFound.explore-search', { defaultValue:'Explore & search'})}
 </Link>
 </Button>
 </div>
 </div>
 </div>
 );
}

export default NotFound;
