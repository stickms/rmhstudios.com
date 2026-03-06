// TODO: Metadata/Viewport types removed — handle via TanStack Start route meta

export default function KowloonKnockoutLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
            <div style={{ fontFamily: "'Press Start 2P', cursive", width: '100vw', height: '100vh' }}>
                {children}
            </div>
        </>
    );
}
