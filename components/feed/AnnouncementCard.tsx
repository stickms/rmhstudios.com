'use client';

import { Link } from'@tanstack/react-router';
import type { FeedItem } from'@/lib/feed-types';
import { ArrowRight, Gamepad2, AppWindow, Newspaper, BookOpen, FlaskConical, Vote } from'lucide-react';

interface AnnouncementCardProps {
 item: FeedItem;
 variant:'product'|'article'|'research'|'election';
}

function getTypeLabel(type: FeedItem['type']): string {
 switch (type) {
 case'game_announcement':
 return'Game';
 case'app_announcement':
 return'App';
 case'news':
 return'News';
 case'blog':
 return'Blog';
 case'research':
 return'Research';
 case'election_announcement':
 return'Elections';
 default:
 return'';
 }
}

function TypeIcon({ type, className }: { type: FeedItem['type']; className?: string }) {
 switch (type) {
 case'game_announcement':
 return <Gamepad2 className={className} />;
 case'app_announcement':
 return <AppWindow className={className} />;
 case'news':
 return <Newspaper className={className} />;
 case'blog':
 return <BookOpen className={className} />;
 case'research':
 return <FlaskConical className={className} />;
 case'election_announcement':
 return <Vote className={className} />;
 default:
 return <Newspaper className={className} />;
 }
}

/**
 * Live seat counts for an election card. Neutral on purpose: the feed has one accent,
 * so Democrats take it and Republicans the muted ink, each labelled with a letter and
 * a number (never colour alone). The full-colour board lives on /elections.
 */
function ElectionBoard({ election }: { election: NonNullable<FeedItem['election']> }) {
 return (
 <div className="mt-3 space-y-2" role="group" aria-label="Seat counts">
 {election.chambers.map((c) => {
 const total = Math.max(1, c.dem + c.gop);
 return (
 <div key={c.office} className="text-xs text-site-text-muted">
 <div className="flex items-baseline justify-between gap-2">
 <span className="font-medium text-site-text">{c.name}</span>
 <span className="tabular-nums">
 D {c.dem} · R {c.gop} · {c.toWin} to win
 {c.controlledBy ? ` · ${c.controlledBy === 'DEM' ? 'D' : c.controlledBy === 'GOP' ? 'R' : 'I'} control` : ''}
 </span>
 </div>
 <div className="mt-1 flex h-1.5 overflow-hidden rounded-site-sm bg-site-bg-subtle" aria-hidden>
 <div className="bg-site-accent" style={{ width: `${(c.dem / total) * 100}%` }} />
 <div className="bg-site-text-dim" style={{ width: `${(c.gop / total) * 100}%` }} />
 </div>
 </div>
 );
 })}
 <p className="text-xs text-site-text-dim">
 {election.live ? `${election.called} of ${election.total} races called` : 'Current control, before any votes are counted'}
 </p>
 </div>
 );
}

export function AnnouncementCard({ item, variant }: AnnouncementCardProps) {
 const typeLabel = getTypeLabel(item.type);

 return (
 <article className="glass-fill social-post social-announcement px-4 py-3">
 {/* System badge */}
 <div className="flex items-center gap-2 text-xs text-site-text-dim mb-2 pl-13">
 <TypeIcon type={item.type} className="w-3.5 h-3.5"/>
 <span className="font-medium">RMH {typeLabel}</span>
 </div>

 <div className="flex gap-3">
 {/* Icon avatar */}
 <div
 className={`text-on-media w-10 h-10 rounded-full bg-linear-to-br ${item.gradient ||'from-site-accent to-site-accent-hover'} flex items-center justify-center shrink-0`}
 >
 <TypeIcon type={item.type} className="w-5 h-5"/>
 </div>

 <div className="flex-1 min-w-0">
 {/* Title */}
 {item.href ? (
 <Link to={item.href} className="group">
 <h3 className="font-bold text-site-text group-hover:text-site-accent transition-colors text-[15px]">
 {item.title}
 </h3>
 </Link>
 ) : (
 <h3 className="font-bold text-site-text text-[15px]">{item.title}</h3>
 )}

 {/* Description */}
 {item.description && (
 <p className="text-sm text-site-text-muted mt-1 line-clamp-3">{item.description}</p>
 )}

 {item.election && item.election.chambers.length > 0 && (
 <ElectionBoard election={item.election} />
 )}

 {/* Image preview */}
 {item.imagePath && (
 <div className="mt-3 rounded-site overflow-hidden border border-site-border">
 <img
 src={item.imagePath}
 alt={item.title ||''}
 loading="lazy"
 decoding="async"
 className="w-full h-40 object-cover"
 />
 </div>
 )}

 {/* Tags */}
 {item.tags && item.tags.length > 0 && (
 <div className="flex flex-wrap gap-2 mt-2">
 {item.tags.map((tag) => (
 <span
 key={tag}
 className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent font-medium"
 >
 {tag}
 </span>
 ))}
 </div>
 )}

 {/* Meta info */}
 <div className="flex items-center gap-2 mt-2 text-xs text-site-text-dim">
 {item.category && <span>{item.category}</span>}
 {item.sourcePublisher && (
 <>
 {item.category && <span>·</span>}
 <span>{item.sourcePublisher}</span>
 </>
 )}
 </div>

 {/* CTA */}
 {item.href && (
 <Link
 to={item.href}
 aria-label={`${variant ==='product'?'Check it out': variant ==='election'?'Open live results':'Read more'}: ${item.title}`}
 className="inline-flex items-center gap-1 text-sm text-site-accent hover:text-site-accent-hover mt-2 transition-colors"
 >
 {variant ==='product'?'Check it out': variant ==='election'?'Open live results':'Read more'}
 <ArrowRight className="w-3.5 h-3.5"aria-hidden />
 </Link>
 )}
 </div>
 </div>
 </article>
 );
}
