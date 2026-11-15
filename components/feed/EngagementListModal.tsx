import { useEffect, useState } from'react';
import { Link } from'@tanstack/react-router';
import { Spinner } from'@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle } from'@/components/ui/dialog';
import { UserAvatar } from'./UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface EngagementUser {
 id: string;
 name: string | null;
 username: string | null;
 handle: string | null;
 image: string | null;
}

interface EngagementListModalProps {
 open: boolean;
 onClose: () => void;
 postId: string;
 commentId?: string;
 type:'likes'|'reposts';
}

export function EngagementListModal({ open, onClose, postId, commentId, type }: EngagementListModalProps) {
 const [users, setUsers] = useState<EngagementUser[]>([]);
 const [loading, setLoading] = useState(false);
 // Steel M9: the list replaces the spinner.
 const arrival = useArrival(!loading);

 const title = type ==='likes'?'Liked by':'reRMHark\u2019d by';
 const base = commentId
 ? `/api/rmharks/${postId}/comment/${commentId}`
 : `/api/rmharks/${postId}`;
 const endpoint = `${base}/${type ==='likes'?'like':'repost'}`;

 useEffect(() => {
 if (!open) return;
 setLoading(true);
 setUsers([]);
 fetch(endpoint)
 .then((res) => res.json())
 .then((data) => setUsers(data))
 .catch(console.error)
 .finally(() => setLoading(false));
 }, [open, endpoint]);

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
 <DialogContent className="max-w-md p-0 gap-0 flex flex-col max-h-[80dvh] overflow-hidden">
 <div className="flex items-center justify-between px-5 py-4 border-b border-site-border shrink-0">
 <DialogTitle className="font-semibold text-lg text-site-text">
 {title}
 </DialogTitle>
 </div>

 <div className="overflow-y-auto flex-1">
 {users.length === 0 && !loading && (
 <div className={cn('flex flex-col items-center justify-center py-12 px-5 text-center', arrival)}>
 <p className="text-site-text font-medium mb-1">
 No {type ==='likes'?'likes':'reRMHarks'} yet
 </p>
 </div>
 )}

 {users.map((user) => (
 <Link
 key={user.id}
 to={`/u/${user.handle || user.id}`as string}
 onClick={onClose}
 className={cn(
 'flex items-center gap-3 px-5 py-3 hover:bg-site-surface-hover active:scale-[0.99] transition-[background-color,scale] duration-site-fast border-b border-site-border/50',
 arrival,
 )}
 >
 <UserAvatar user={user} linkToProfile={false} />
 <div className="min-w-0">
 <p className="font-semibold text-site-text text-sm truncate">
 {user.name || user.username ||'Unknown'}
 </p>
 {user.handle && (
 <p className="text-xs text-site-text-muted truncate">@{user.handle}</p>
 )}
 </div>
 </Link>
 ))}

 {loading && (
 <div className="flex justify-center py-6">
 <Spinner size={20} />
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
