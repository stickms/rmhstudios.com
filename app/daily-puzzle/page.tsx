import { DailyPuzzleGame } from '@/components/daily-puzzle/DailyPuzzleGame';

export const metadata = {
    title: 'Lights Out | RMH Studios',
    description: 'A daily puzzle game. Turn off all the lights in this classic logic puzzle. New puzzle every day.',
};

export default function DailyPuzzlePage() {
    return (
        <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
            <DailyPuzzleGame />
        </div>
    );
}
