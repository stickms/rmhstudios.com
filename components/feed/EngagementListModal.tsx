'use client';

import { useEffect, useState } from'react';
import { Link } from'@tanstack/react-router';
import { Spinner } from'@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle } from'@/components/ui/dialog';
import { UserAvatar } from'./UserAvatar';

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
 <DialogContent className="max-w-md p-0 gap-0 bg-site-bg flex flex-col max-h-[80vh] overflow-hidden">
 <div className="flex items-center justify-between px-5 py-4 border-b border-site-border shrink-0">
 <DialogTitle className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
 {title}
 </DialogTitle>
 </div>

 <div className="overflow-y-auto flex-1">
 {users.length === 0 && !loading && (
 <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
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
 className="flex items-center gap-3 px-5 py-3 hover:bg-site-surface-hover active:scale-[0.99] transition-[background-color,transform] duration-150 border-b border-site-border/50"
 >
 <UserAvatar user={user} linkToProfile={false} />
 <div className="min-w-0">
 <p className="font-bold text-site-text text-sm truncate">
 {user.name || user.username ||'Unknown'}
 </p>
 {user.handle && (
 <p className="text-xs text-site-text-dim truncate">@{user.handle}</p>
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
