'use client';

import { useState } from'react';
import { EyeOff } from'lucide-react';
import { useTranslation } from'react-i18next';

/**
 * Wraps post media (images/GIF) flagged as sensitive. Until the viewer opts in,
 * the children are blurred behind a"Sensitive content"cover; clicking reveals
 * them. When `sensitive`is false this renders the children unchanged.
 */
export function SensitiveMedia({
 sensitive,
 children,
 className ='',
}: {
 sensitive?: boolean;
 children: React.ReactNode;
 className?: string;
}) {
 const { t } = useTranslation('feed');
 const [revealed, setRevealed] = useState(false);

 if (!sensitive || revealed) return <>{children}</>;

 return (
 <div className={`relative overflow-hidden rounded-site-sm ${className}`}>
 {/* The real media stays mounted (so layout is reserved) but blurred. */}
 <div className="pointer-events-none select-none blur-2xl"aria-hidden="true">
 {children}
 </div>
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 setRevealed(true);
 }}
 className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-site-bg/70 text-center transition-colors hover:bg-site-bg/60"
 >
 <EyeOff className="h-5 w-5 text-site-text-muted"aria-hidden="true"/>
 <span className="text-sm font-semibold text-site-text">
 {t('sensitive-content', { defaultValue:'Sensitive content'})}
 </span>
 <span className="text-xs text-site-text-muted">
 {t('sensitive-content-reveal', { defaultValue:'Click to view'})}
 </span>
 </button>
 </div>
 );
}
