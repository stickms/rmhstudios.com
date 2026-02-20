'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { authClient } from '@/lib/auth-client';
import { MessageSquare } from 'lucide-react';

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    user: {
        name: string;
        username?: string;
        image?: string;
    };
}

interface SongCommentsProps {
    songId: string | null;
}

export function SongComments({ songId }: SongCommentsProps) {
    const session = authClient.useSession();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isPosting, setIsPosting] = useState(false);

    useEffect(() => {
        if (songId) {
            fetchComments();
        } else {
            setComments([]);
        }
    }, [songId]);

    const fetchComments = async () => {
        if (!songId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/slice-it/songs/${songId}/comments`);
            if (res.ok) {
                const data = await res.json();
                setComments(data);
            }
        } catch (e) {
            console.error("Failed comments", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim() || !songId) return;
        setIsPosting(true);
        try {
            const res = await fetch(`/api/slice-it/songs/${songId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newComment })
            });
            if (res.ok) {
                setNewComment("");
                fetchComments();
            }
        } catch(e) {
            console.error(e);
        } finally {
            setIsPosting(false);
        }
    };

    if (!songId) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2 h-full min-h-[200px] bg-[#e0e5ec] rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]">
                <MessageSquare className="w-8 h-8 opacity-20" />
                <span className="text-xs">Select a song to view comments</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#e0e5ec] rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] p-4 overflow-hidden">
             <div className="pb-3 border-b border-slate-200/50 mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Discussion</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 min-h-[150px]">
                {isLoading ? (
                    <div className="text-center py-8 text-slate-400 text-xs">Loading...</div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
                        <span className="text-xs">No comments yet.</span>
                    </div>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="flex gap-2 animate-in slide-in-from-bottom-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0 shadow-sm mt-1">
                                {comment.user.name?.[0] || "?"}
                            </div>
                            <div className="bg-white/60 p-2 rounded-xl rounded-tl-none shadow-sm flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-bold text-slate-700 text-[10px]">{comment.user.name}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-slate-600 text-xs leading-relaxed">{comment.content}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="pt-3 mt-2 border-t border-slate-200/50">
                {session.data ? (
                    <div className="flex gap-2">
                        <Textarea 
                            placeholder="Write a comment..." 
                            className="bg-white min-h-[40px] h-[40px] py-2 text-xs resize-none border-none shadow-inner"
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                        />
                        <Button 
                            onClick={handlePostComment} 
                            disabled={isPosting || !newComment.trim()}
                            size="sm"
                            className="h-[40px] w-12 bg-blue-500 hover:bg-blue-600 text-white shadow-md rounded-lg p-0"
                        >
                            POST
                        </Button>
                    </div>
                ) : (
                    <div className="text-center text-[10px] text-slate-400">
                        Sign in to comment
                    </div>
                )}
            </div>
        </div>
    );
}
