export interface TrackMetadata {
    id: string;
    name: string;
    artist: string;
    audioUrl: string;
    bpm?: number;
}

export const TRACKS: TrackMetadata[] = [
    {
        id: 'rmh-afrosoul',
        name: 'RMH Afrosoul',
        artist: 'RMH Studios',
        audioUrl: '/music/rmh_afrosoul.mp3',
        bpm: 120 
    },
    {
        id: 'rmh-official',
        name: 'RMH Official',
        artist: 'RMH Studios',
        audioUrl: '/music/rmh_song_official.mp3',
        bpm: 128 
    }
];
