
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory'; // Named import
import { useGameStore } from '@/lib/store/useGameStore';
import { authClient } from "@/lib/auth-client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Share2, Check } from 'lucide-react';

import { SongLibrary } from '@/components/game/SongLibrary'; // Import SongLibrary

interface Player {
    id: string;
    name: string;
    score: number;
    isReady: boolean;
}

interface LobbyData {
    lobbyId: string;
    players: Player[];
    hostId: string;
    status: 'WAITING' | 'PLAYING';
    song: any | null;
}

export function MultiplayerLobby({ onBack, onStart, onSelectSong }: { onBack: () => void, onStart: (lobbyId: string, song: any) => void, onSelectSong: (song: any) => void }) {
    // const { userName, setUserName } = useGameStore(); // No longer used locally here

    const [lobbyIdInput, setLobbyIdInput] = React.useState('');
    const [lobbyData, setLobbyData] = React.useState<LobbyData | null>(null);
    const [status, setStatus] = React.useState<string>('Disconnnected');
    const [showSongSelect, setShowSongSelect] = React.useState(false);
    const [isCopied, setIsCopied] = React.useState(false);
    
    const searchParams = useSearchParams();
    const router = useRouter();
    const mp = MultiplayerFactory.getInstance();

    const handleLeave = () => {
        mp.disconnect();
        // Strip the ?lobby= param from the URL without a full navigation
        if (searchParams.get('lobby')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('lobby');
            router.replace(url.pathname + (url.search || ''));
        }
        onBack();
    };

    React.useEffect(() => {
        mp.connect();
        setStatus('Connected');

        const onLobbyUpdate = (data: LobbyData) => {
            console.log("Lobby Update:", data);
            setLobbyData(data);
            
            // If game started
            if (data.status === 'PLAYING') {
                onStart(data.lobbyId, data.song);
            }
        };

        const onGameStarting = () => {
             // Countdown?
             console.log("Game Starting...");
        };
        
        const onSongSelected = (data: { song: any }) => {
            console.log("Song Selected via Socket:", data.song);
            // Update local lobby data immediately for UI
            setLobbyData(prev => prev ? ({ ...prev, song: data.song }) : null);
            // Load the song in MainMenu
            onSelectSong(data.song);
        };

        mp.on('lobby_update', onLobbyUpdate);
        mp.on('game_starting', onGameStarting);
        mp.on('song_selected', onSongSelected);

        return () => {
             mp.off('lobby_update', onLobbyUpdate);
             mp.off('game_starting', onGameStarting);
             mp.off('song_selected', onSongSelected);
        };
    }, [mp, onStart, onSelectSong]);
    
    const { data: session, isPending } = authClient.useSession();

    // Auto-join from URL
    React.useEffect(() => {
        const lobbyParam = searchParams.get('lobby');
        if (lobbyParam && session && !lobbyData) {
            console.log("Auto-joining lobby from URL:", lobbyParam);
            mp.joinLobby(lobbyParam.toUpperCase(), session.user.name || 'Unknown', session.user.id);
        }
    }, [searchParams, session, lobbyData, mp]);

    const handleCreateLobby = () => {
        if (!session) return;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        mp.joinLobby(id, session.user.name || 'Unknown', session.user.id);
    };

    const handleJoinLobby = () => {
        if (!lobbyIdInput || !session) return;
        mp.joinLobby(lobbyIdInput.toUpperCase(), session.user.name || 'Unknown', session.user.id);
    };

    const handleStartGame = () => {
        if (!lobbyData) return;
        mp.startGame(lobbyData.lobbyId);
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}${window.location.pathname}?lobby=${lobbyData?.lobbyId}`;
        navigator.clipboard.writeText(url).then(() => {
            setIsCopied(true);
            toast.success("Invite link copied to clipboard!");
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    if (lobbyData) {
        // INSIDE LOBBY
        const isHost = lobbyData.hostId === mp.getSocketId();
        
        if (showSongSelect && isHost) {
            return (
                <div className="absolute inset-0 z-[60] bg-[#e0e5ec] p-4 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slate-600">SELECT A SONG</h2>
                        <Button variant="ghost" onClick={() => setShowSongSelect(false)}>CANCEL</Button>
                    </div>
                    <div className="flex-1 overflow-hidden rounded-2xl shadow-[inset_10px_10px_20px_#bebebe,inset_-10px_-10px_20px_#ffffff] p-4">
                         <SongLibrary 
                             onSelect={(song) => {
                             console.log("Host selected song:", song);
                             // Send to server
                             mp.selectSong(lobbyData.lobbyId, song);
                             setShowSongSelect(false);
                         }} 
                         onHighlight={() => {}} 
                         selectedSongId={null}
                         />
                    </div>
                </div>
            );
        }
        
        return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
                 <Card className="w-full max-w-lg bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none">
                    <CardHeader>
                        <CardTitle className="text-2xl font-black text-center text-slate-600 flex flex-col items-center gap-2">
                            <span>LOBBY CODE</span>
                            <div className="flex items-center gap-3">
                                <span className="text-4xl tracking-widest text-blue-500 bg-[#e0e5ec] px-4 py-2 rounded-2xl shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff]">
                                    {lobbyData.lobbyId}
                                </span>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-12 w-12 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] active:shadow-[inset_2px_2px_5px_#bebebe,inset_-2px_-2px_5px_#ffffff] transition-all"
                                    onClick={handleCopyLink}
                                    title="Copy Invite Link"
                                >
                                    {isCopied ? <Check className="w-6 h-6 text-green-500" /> : <Share2 className="w-6 h-6 text-slate-600" />}
                                </Button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Players</h3>
                            {lobbyData.players.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-[#e0e5ec] p-3 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]">
                                    <span className="font-bold">{p.name}</span>
                                    {p.id === lobbyData.hostId && <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full font-bold">HOST</span>}
                                </div>
                            ))}
                         </div>
                         
                         <div className="space-y-2">
                            <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Selected Song</h3>
                            <div className="bg-[#e0e5ec] p-4 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] flex justify-between items-center">
                                {lobbyData.song ? (
                                    <div>
                                        <div className="font-bold">{lobbyData.song.title}</div>
                                        <div className="text-xs text-slate-500">{lobbyData.song.artist}</div>
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic">No song selected</span>
                                )}
                                
                                {isHost && (
                                    <Button size="sm" onClick={() => setShowSongSelect(true)} className="ml-4">
                                        CHANGE
                                    </Button>
                                )}
                            </div>
                         </div>

                         <div className="flex gap-4 pt-4">
                            <Button 
                                variant="ghost"
                                className="flex-1 text-slate-500 hover:text-red-500"
                                onClick={handleLeave}
                            >
                                LEAVE
                            </Button>
                            {isHost && (
                                <Button 
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl"
                                    onClick={handleStartGame}
                                    disabled={!lobbyData.song}
                                >
                                    START GAME
                                </Button>
                            )}
                        </div>
                    </CardContent>
                 </Card>
            </div>
        );
    }

    // LIST / JOIN VIEW
    if (isPending) {
         return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
         );
    }

    if (!session) {
        return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
                 <Card className="w-full max-w-md bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none p-8 text-center">
                    <h2 className="text-2xl font-black text-slate-600 mb-4">MULTIPLAYER</h2>
                    <p className="text-slate-500 mb-6 font-medium">To play online and track your stats, you need to sign in with your account.</p>
                    <Button 
                        className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg mb-4"
                        onClick={() => window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname)}`}
                    >
                        SIGN IN / SIGN UP
                    </Button>
                    <Button variant="ghost" onClick={handleLeave} className="text-slate-400 hover:text-slate-600">
                        CANCEL
                    </Button>
                 </Card>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
             <Card className="w-full max-w-md bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none">
                <CardHeader>
                    <CardTitle className="text-2xl font-black text-center text-slate-600">MULTIPLAYER</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="text-center">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">Signed in as</div>
                        <div className="font-bold text-lg text-slate-700">{session.user.name}</div>
                    </div>

                    <div className="flex flex-col gap-4">
                         <div className="flex gap-2">
                            <Input 
                                value={lobbyIdInput} 
                                onChange={(e) => setLobbyIdInput(e.target.value)} 
                                placeholder="Lobby Code"
                                className="bg-[#e0e5ec] border-none shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] rounded-xl uppercase text-center font-mono tracking-widest"
                            />
                            <Button 
                                className="bg-[#e0e5ec] text-blue-500 font-bold shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] rounded-xl"
                                onClick={handleJoinLobby}
                            >
                                JOIN
                            </Button>
                         </div>
                         
                         <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-300"></span></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#e0e5ec] px-2 text-slate-400 font-bold">Or</span></div>
                        </div>

                         <Button 
                            className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg"
                            onClick={handleCreateLobby}
                        >
                            CREATE LOBBY
                        </Button>
                    </div>

                    <Button 
                        variant="ghost"
                        className="w-full text-slate-400 hover:text-slate-600"
                        onClick={handleLeave}
                    >
                        BACK TO MENU
                    </Button>
                </CardContent>
             </Card>
        </div>
    );
}
