import { useTranslation } from'react-i18next';
import { Pause, Play } from 'lucide-react';

interface VinylRecordProps {
 albumArt: string;
 title: string;
 artist: string;
 isPlaying: boolean;
 onToggle: () => void;
}

export function VinylRecord({ albumArt, title, artist, isPlaying, onToggle }: VinylRecordProps) {
 const { t } = useTranslation('feed');
 const actionLabel = isPlaying
 ? t('pause-profile-song', { title, defaultValue:'Pause {{title}}'})
 : t('play-profile-song', { title, defaultValue:'Play {{title}}'});

 return (
 <div className="flex flex-col items-center gap-1">
 <button
 type="button"
 onClick={onToggle}
 className="group relative size-14 cursor-pointer rounded-full outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-site-accent/60"
 title={actionLabel}
 aria-label={actionLabel}
 >
 {/* Vinyl disc body */}
 <div
 className="absolute inset-0 rounded-full border border-site-border "
 style={{
 background: `
 radial-gradient(circle at center,
 transparent 32%,
 var(--site-border) 33%,
 var(--site-text-muted) 34%,
 transparent 35%,
 transparent 44%,
 var(--site-border) 45%,
 var(--site-text-muted) 46%,
 transparent 47%,
 transparent 56%,
 var(--site-border) 57%,
 var(--site-text-muted) 58%,
 transparent 59%,
 transparent 68%,
 var(--site-border) 69%,
 var(--site-text-muted) 70%,
 transparent 71%,
 transparent 80%,
 var(--site-border) 81%,
 var(--site-text-muted) 82%,
 transparent 83%,
 transparent 91%,
 var(--site-surface) 100%
 )
 `,
 backgroundColor:'var(--site-surface)',
 animation: isPlaying ?'vinyl-spin 3s linear infinite':'none',
 }}
 >
 {/* Center label with album art */}
 <div className="absolute left-1/2 top-1/2 size-[38%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-site-border">
 <img
 src={albumArt}
 alt={title}
 className="w-full h-full object-cover"
 draggable={false}
 />
 </div>

 {/* Center spindle dot */}
 <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-site-surface"/>
 </div>

 {/* Hover overlay */}
 <div className="absolute inset-0 flex items-center justify-center rounded-full bg-site-bg/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
 {isPlaying ? (
 <Pause className="size-5 fill-current text-site-text"aria-hidden />
 ) : (
 <Play className="size-5 fill-current text-site-text"aria-hidden />
 )}
 </div>
 </button>

 {/* Song info */}
 <div className="text-center max-w-[72px]">
 <p className="text-micro text-site-text font-medium truncate leading-tight">{title}</p>
 <p className="text-tiny text-site-text-muted truncate leading-tight">{artist}</p>
 </div>
 </div>
 );
}
