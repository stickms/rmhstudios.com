import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'RMH Notes',
    description: 'Cozy notes & reminders app.',
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
