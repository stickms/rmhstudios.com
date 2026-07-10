"use client";

export interface ToastItem {
  id: number;
  text: string;
  color?: string;
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="pointer-events-none absolute bottom-32 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {items.map((t) => (
        <div
          key={t.id}
          className="haw-toast rounded border border-white/10 bg-black/80 px-3 py-1 font-mono text-xs tracking-wide shadow-lg"
          style={{ color: t.color ?? "#cabba0" }}
        >
          {t.text}
        </div>
      ))}
      <style>{`
        @keyframes hawToastIn {
          0% { opacity: 0; transform: translateY(8px); }
          12% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        .haw-toast { animation: hawToastIn 2.2s ease forwards; }
      `}</style>
    </div>
  );
}
