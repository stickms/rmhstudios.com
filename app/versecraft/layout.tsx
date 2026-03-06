// TODO: Metadata type removed — handle via TanStack Start route meta

export default function VersecraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `:root { --font-eb-garamond: 'EB Garamond', serif; }` }} />
      <div>
        {children}
      </div>
    </>
  );
}
