'use client';

interface MovieRevealProps {
  title: string;
}

export default function MovieReveal({ title }: MovieRevealProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 animate-in fade-in zoom-in duration-700">
      <span className="text-4xl">🎬</span>
      <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">The movie was…</p>
      <h2 className="text-3xl font-extrabold text-(--rmhbox-accent) text-center">
        {title}
      </h2>
    </div>
  );
}
