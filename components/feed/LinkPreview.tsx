'use client';

import { useState, useEffect } from'react';
import { ExternalLink } from'lucide-react';
import { useNearViewport } from'@/hooks/useNearViewport';

interface OgData {
 title: string | null;
 description: string | null;
 image: string | null;
 siteName: string;
}

const ogCache = new Map<string, OgData | null>();

interface LinkPreviewProps {
 url: string;
 className?: string;
}

export function LinkPreview({ url, className =''}: LinkPreviewProps) {
 // Don't fetch the OG data until the card nears the viewport — a first feed
 // page with many links would otherwise fan out N `/api/oembed`requests during
 // hydration (each one a server-side external fetch). Already-cached URLs skip
 // the observer entirely.
 const { ref, visible } = useNearViewport<HTMLDivElement>('400px 0px', ogCache.has(url));
 const [data, setData] = useState<OgData | null>(() => ogCache.get(url) ?? null);
 const [loading, setLoading] = useState(() => !ogCache.has(url));
 const [imgError, setImgError] = useState(false);

 useEffect(() => {
 if (!visible) return;
 if (ogCache.has(url)) {
 setData(ogCache.get(url) ?? null);
 setLoading(false);
 return;
 }

 setLoading(true);
 let cancelled = false;

 fetch(`/api/oembed?type=og&url=${encodeURIComponent(url)}`)
 .then((res) => (res.ok ? res.json() : null))
 .then((result) => {
 if (cancelled) return;
 ogCache.set(url, result);
 setData(result);
 setLoading(false);
 })
 .catch(() => {
 if (!cancelled) {
 ogCache.set(url, null);
 setData(null);
 setLoading(false);
 }
 });

 return () => {
 cancelled = true;
 };
 }, [visible, url]);

 if (loading) {
 // The ref lives on the skeleton so the observer has a target to watch while
 // the preview is still deferred; the skeleton also reserves layout (no CLS).
 return (
 <div ref={ref} className={`rounded-site overflow-hidden border border-site-border ${className}`}>
 <div className="w-full h-24 bg-site-surface animate-pulse"/>
 </div>
 );
 }

 if (!data || (!data.title && !data.description)) return null;

 return (
 <a
 href={url}
 target="_blank"
 rel="noopener noreferrer"
 onClick={(e) => e.stopPropagation()}
 className={`block rounded-site overflow-hidden border border-site-border hover:bg-site-surface/40 transition-colors ${className}`}
 >
 {data.image && !imgError && (
 <div className="w-full h-36 bg-site-surface overflow-hidden">
 <img
 src={data.image}
 alt=""
 loading="lazy"
 onError={() => setImgError(true)}
 className="w-full h-full object-cover"
 />
 </div>
 )}
 <div className="px-3 py-2.5">
 <p className="text-xs text-site-text-dim mb-0.5 flex items-center gap-1">
 <ExternalLink className="w-3 h-3"/>
 {data.siteName}
 </p>
 {data.title && (
 <p className="text-sm font-semibold text-site-text line-clamp-2">{data.title}</p>
 )}
 {data.description && (
 <p className="text-xs text-site-text-dim mt-0.5 line-clamp-2">{data.description}</p>
 )}
 </div>
 </a>
 );
}
