// TODO: Metadata removed — use TanStack Start route meta instead
import './globals.css';

export const metadata = {
    title: 'RMH Job Search',
    description: 'Browse hundreds of job listings. Some real. Some ridiculous. All rejections guaranteed.',
};

export default function RMHJobsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="jobs-theme grid-bg" style={{ minHeight: '100vh', background: 'var(--jobs-bg)', color: 'var(--jobs-text)' }}>
            {children}
        </div>
    );
}
