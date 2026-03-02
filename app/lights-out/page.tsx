import { LightsOutGame } from '@/components/lights-out/LightsOutGame';

export const metadata = {
    title: 'Lights Out | RMH Studios',
    description: 'A daily puzzle game. Turn off all the lights in this classic logic puzzle. New puzzle every day.',
};

export default function LightsOutPage() {
    return (
        <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
            <LightsOutGame />
        </div>
    );
}
