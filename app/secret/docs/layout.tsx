import './globals.css';

// TODO: Metadata type removed — handle via TanStack Start route meta

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
            <div style={{ fontFamily: "'Inter', sans-serif" }}>{children}</div>
        </>
    );
}
