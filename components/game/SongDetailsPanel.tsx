'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Settings, X, Check, ImagePlus } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { SongComments } from './SongComments';
import { useGameStore, Difficulty } from '@/lib/store/useGameStore';
import { Slider } from '@/components/ui/slider';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

interface Song {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    duration: number;
    audioUrl: string;
    coverUrl?: string; // Added coverUrl
    description?: string;
    uploadedBy: string;
    uploader: { name: string };
    _count?: {
        scores: number;
    }
}

interface SongDetailsPanelProps {
    song: Song | null;
    onPlay: (song: Song) => void;
    onSongUpdated?: (updates: Partial<Song>) => void;
}

const ModifierToggle = ({ label, active, onClick, color }: { label: string, active: boolean, onClick: () => void, color: string }) => (
    <div className="flex justify-between items-center bg-slate-50 hover:bg-slate-100 p-2 rounded-lg border border-slate-300 cursor-pointer transition-all" onClick={onClick}>
        <span className="text-xs text-slate-700 font-bold uppercase select-none">{label}</span>
        <div
            className={`w-10 h-5 rounded-full transition-colors relative ${active ? '' : 'bg-slate-300'}`}
            style={{backgroundColor: active ? color : undefined}}
        >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-0.5'}`} />
        </div>
    </div>
);

export function SongDetailsPanel({ song, onPlay, onSongUpdated }: SongDetailsPanelProps) {
    const { modifiers, setModifiers } = useGameStore();
    const session = authClient.useSession();
    const isOwner = !!session.data?.user?.id && session.data.user.id === song?.uploadedBy;

    // Edit state
    const [showEdit, setShowEdit] = React.useState(false);
    const [editTitle, setEditTitle] = React.useState('');
    const [editArtist, setEditArtist] = React.useState('');
    const [editBpm, setEditBpm] = React.useState('');
    const [editDescription, setEditDescription] = React.useState('');
    const [editCoverFile, setEditCoverFile] = React.useState<File | null>(null);
    const [editCoverPreview, setEditCoverPreview] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);

    const openEdit = () => {
        if (!song) return;
        setEditTitle(song.title);
        setEditArtist(song.artist);
        setEditBpm(String(Math.round(song.bpm)));
        setEditDescription(song.description ?? '');
        setEditCoverFile(null);
        setEditCoverPreview(null);
        setShowEdit(true);
    };

    const MAX_COVER_SIZE = 2.5 * 1024 * 1024; // 2.5 MB

    const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_COVER_SIZE) {
            toast.error(`Cover image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 2.5 MB.`);
            e.target.value = '';
            return;
        }
        setEditCoverFile(file);
        const url = URL.createObjectURL(file);
        setEditCoverPreview(url);
    };

    const handleSave = async () => {
        if (!song) return;
        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('title', editTitle);
            formData.append('artist', editArtist);
            formData.append('bpm', editBpm);
            formData.append('description', editDescription);
            if (editCoverFile) formData.append('cover', editCoverFile);

            const res = await fetch(`/api/slice-it/songs/${song.id}`, {
                method: 'PATCH',
                body: formData,
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const newCoverUrl = data.song?.coverUrl ?? song.coverUrl;
            const newBpm = parseFloat(editBpm) || song.bpm;
            onSongUpdated?.({ title: editTitle, artist: editArtist, bpm: newBpm, description: editDescription, coverUrl: newCoverUrl });
            setShowEdit(false);
            if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
            setEditCoverFile(null);
            setEditCoverPreview(null);
            toast.success('Track updated');
        } catch (e: any) {
            toast.error('Failed to save: ' + (e.message ?? 'Unknown error'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!song) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 space-y-4">
                <div className="w-32 h-32 rounded-lg bg-slate-300 animate-pulse" />
                <div className="font-bold text-lg text-center">
                    Select a track to begin
                </div>
            </div>
        );
    }

    const getScoreMultiplier = () => {
        let mult = 1.0;
        // Difficulty base multiplier
        if (modifiers.difficulty === 'easy') mult *= 0.7;
        else if (modifiers.difficulty === 'normal') mult *= 1.0;
        else if (modifiers.difficulty === 'hard') mult *= 1.3;
        else if (modifiers.difficulty === 'expert') mult *= 1.5;
        if (modifiers.invisible) mult += 0.2;
        if (modifiers.speed > 1.0) mult += (modifiers.speed - 1.0) * 0.5;
        if (modifiers.bombs) mult += 0.15;
        if (modifiers.switching) mult += 0.15;
        if (modifiers.spin) mult += 0.15;
        if (modifiers.strictTiming) mult += 0.25;
        return mult;
    };

    return (
        <>
            {/* Edit Modal */}
            {showEdit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-700 uppercase tracking-tight">Edit Track</h3>
                            <button className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" onClick={() => setShowEdit(false)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {/* Cover Image */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cover Image</label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 group-hover:border-blue-400 transition-colors shrink-0 relative">
                                        {(editCoverPreview || song?.coverUrl) ? (
                                            <img src={editCoverPreview ?? song?.coverUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400">
                                                <ImagePlus className="w-6 h-6" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold text-blue-500 group-hover:text-blue-600">{editCoverFile ? editCoverFile.name : 'Click to change cover'}</span>
                                        <span className="text-xs text-slate-400">PNG, JPG, WebP</span>
                                    </div>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverSelect} />
                                </label>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Title</label>
                                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-slate-50 text-slate-700 border-slate-200" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Artist</label>
                                <Input value={editArtist} onChange={e => setEditArtist(e.target.value)} className="bg-slate-50 text-slate-700 border-slate-200" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">BPM</label>
                                <Input type="number" value={editBpm} onChange={e => setEditBpm(e.target.value)} className="bg-slate-50 text-slate-700 border-slate-200" placeholder="e.g. 120" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
                                <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="bg-slate-50 text-slate-700 border-slate-200" placeholder="Optional description..." />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button variant="ghost" className="flex-1 text-slate-500" onClick={() => setShowEdit(false)} disabled={isSaving}>Cancel</Button>
                            <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold gap-2" onClick={handleSave} disabled={isSaving}>
                                <Check className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col">
            {/* Header / Info */}
            <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-b border-slate-200">
                <div className="flex gap-4 items-start">
                    {/* Cover Art */}
                    <div className="w-32 h-32 rounded-lg bg-slate-300 shrink-0 overflow-hidden relative shadow-lg">
                         {song.coverUrl ? (
                             <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                         ) : (
                             <div className="flex items-center justify-center h-full text-slate-400 font-black text-5xl select-none">
                                 {song.title.charAt(0)}
                             </div>
                         )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="text-2xl font-black text-slate-700 leading-tight mb-1">{song.title}</h2>
                            {isOwner && (
                                <button
                                    className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
                                    onClick={openEdit}
                                    title="Edit track info"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="text-blue-500 font-bold text-lg mb-3">{song.artist}</div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Tempo</span>
                                <span className="font-mono text-slate-700 font-bold text-sm">{Math.round(song.bpm)} BPM</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Duration</span>
                                <span className="font-mono text-slate-700 font-bold text-sm">{Math.floor(song.duration / 60)}:{Math.round(song.duration % 60).toString().padStart(2, '0')}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Difficulty</span>
                                <span className={`font-mono font-bold text-sm ${
                                    modifiers.difficulty === 'easy' ? 'text-green-500' :
                                    modifiers.difficulty === 'normal' ? 'text-blue-500' :
                                    modifiers.difficulty === 'hard' ? 'text-orange-500' :
                                    'text-red-500'
                                }`}>{modifiers.difficulty.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Play Button & Multiplier */}
                <div className="mt-4 flex items-center gap-3">
                    <Button
                        className="flex-1 h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold text-base rounded-lg active:scale-95 transition-all flex items-center justify-center gap-3 group"
                        onClick={() => onPlay(song)}
                    >
                        <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                        <span className="uppercase tracking-wide">Start Game</span>
                    </Button>
                    <div className="flex flex-col items-center px-4 py-2 bg-white rounded-lg border border-slate-300">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Multiplier</div>
                        <div className="text-xl font-black text-blue-500 tabular-nums">x{getScoreMultiplier().toFixed(2)}</div>
                    </div>
                </div>
            </div>

            {/* Modifiers Section */}
            <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-3">Difficulty</h3>
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {(['easy', 'normal', 'hard', 'expert'] as Difficulty[]).map(d => {
                        const isActive = modifiers.difficulty === d;
                        const colorMap: Record<Difficulty, string> = {
                            easy: '#22c55e',
                            normal: '#3b82f6',
                            hard: '#f97316',
                            expert: '#ef4444'
                        };
                        const noteMap: Record<Difficulty, string> = {
                            easy: '70%',
                            normal: '100%',
                            hard: '150%',
                            expert: '200%'
                        };
                        return (
                            <button
                                key={d}
                                onClick={() => setModifiers({ ...modifiers, difficulty: d })}
                                className={`px-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${
                                    isActive
                                        ? 'text-white shadow-md scale-[1.02]'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                }`}
                                style={isActive ? { backgroundColor: colorMap[d], borderColor: colorMap[d] } : undefined}
                            >
                                <div>{d}</div>
                                <div className={`text-[10px] font-normal mt-0.5 ${isActive ? 'text-white/80' : 'text-slate-300'}`}>{noteMap[d]} notes</div>
                            </button>
                        );
                    })}
                </div>

                <h3 className="text-sm font-bold text-slate-700 uppercase mb-3">Game Modifiers</h3>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <ModifierToggle
                        label="Invisible"
                        active={modifiers.invisible}
                        onClick={() => setModifiers({...modifiers, invisible: !modifiers.invisible})}
                        color="#a855f7"
                    />
                    <ModifierToggle
                        label="Bombs"
                        active={modifiers.bombs}
                        onClick={() => setModifiers({...modifiers, bombs: !modifiers.bombs})}
                        color="#f97316"
                    />
                    <ModifierToggle
                        label="Switching"
                        active={modifiers.switching}
                        onClick={() => setModifiers({...modifiers, switching: !modifiers.switching})}
                        color="#3b82f6"
                    />
                    <ModifierToggle
                        label="Spin"
                        active={modifiers.spin}
                        onClick={() => setModifiers({...modifiers, spin: !modifiers.spin})}
                        color="#06b6d4"
                    />
                    <ModifierToggle
                        label="Strict Timing"
                        active={modifiers.strictTiming}
                        onClick={() => setModifiers({...modifiers, strictTiming: !modifiers.strictTiming})}
                        color="#dc2626"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-slate-500 uppercase">Playback Speed</h3>
                        <div className="flex items-center gap-2">
                            {modifiers.speed < 1.0 && (
                                <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full">Unranked</span>
                            )}
                            <span className="text-blue-500 font-mono font-bold text-sm">x{modifiers.speed.toFixed(1)}</span>
                        </div>
                    </div>
                    <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
                        <Slider
                            value={[modifiers.speed]}
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            onValueChange={(vals) => setModifiers({...modifiers, speed: vals[0]})}
                            className="cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Leaderboard Section */}
            <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-3">Leaderboard</h3>
                <div className="bg-slate-50 rounded-lg border border-slate-300 p-3 max-h-[300px] overflow-y-auto">
                    <Leaderboard songId={song.id} />
                </div>
            </div>

            {/* Comments Section */}
            <div className="p-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-3">Comments</h3>
                <div className="bg-slate-50 rounded-lg border border-slate-300 p-3 min-h-[200px]">
                    <SongComments songId={song.id} />
                </div>
            </div>
        </div>
        </>
    );
}
