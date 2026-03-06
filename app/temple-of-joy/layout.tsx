// TODO: Metadata type removed — handle via TanStack Start route meta

export default function TempleOfJoyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `:root { --font-cormorant: 'Cormorant Garamond', serif; }` }} />
      <div className="font-sans" style={{ fontFamily: "var(--font-cormorant), sans-serif" }}>
        {children}
      </div>
    </>
  );
}
