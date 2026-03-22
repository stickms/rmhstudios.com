import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Moon, Zap, Clock } from 'lucide-react';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { CountdownTimer } from '@/components/doctrine/countdown-timer';
import { SAHUR_WINDOW } from '@/lib/doctrine/constants';

export const Route = createFileRoute('/strategies/sahur')({
  component: SahurPage,
});

function SahurPage() {
  const { sahurActive, sahurConfig, sahurCountdown } = useDoctrineSahur();
  const setDoctrineTheme = useDoctrineStore(s => s.setDoctrineTheme);

  useEffect(() => {
    if (sahurActive) setDoctrineTheme('sahur');
    return () => setDoctrineTheme('default');
  }, [sahurActive, setDoctrineTheme]);

  if (sahurActive) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8 pb-20 md:pb-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-black" style={{ color: '#F59E0B', textShadow: '0 0 30px rgba(245,158,11,0.4)' }}>
            {SAHUR_WINDOW.greeting}
          </h1>
          <div className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1 text-sm font-bold text-amber-400">
              <Zap size={16} /> {SAHUR_WINDOW.xpMultiplier}x XP
            </span>
            <span className="flex items-center gap-1 text-sm text-amber-300/60">
              <Clock size={16} /> {sahurCountdown} min remaining
            </span>
          </div>
        </div>

        {/* Sahur exclusive content */}
        <div className="rounded-xl p-6 text-center space-y-4" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Moon size={32} className="mx-auto text-amber-400" />
          <h2 className="text-lg font-bold text-amber-300">Sahur Challenge</h2>
          <p className="text-sm text-amber-300/60">
            The exclusive 3 AM puzzle is available now. Complete it before the window closes.
            Miss it and it's gone. No archive. No second chance.
          </p>
          <a
            href="/strategies/puzzles"
            className="inline-block px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110"
            style={{ background: '#F59E0B', color: '#000' }}
          >
            Play Sahur Puzzle
          </a>
        </div>

        <div className="text-center">
          <p className="text-[10px] font-mono text-amber-400/30">
            TEMPORAL MONOPOLY — THIS CONTENT SELF-DESTRUCTS AT 4:00 AM
          </p>
        </div>
      </div>
    );
  }

  // Sahur is not active — show countdown
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Moon size={20} className="text-white/30" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Sahur Mode
        </h1>
      </div>

      <div className="rounded-xl p-8 text-center space-y-6" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Moon size={48} className="mx-auto text-white/10" />
        <h2 className="text-lg font-semibold text-white/60">Not Active</h2>
        <p className="text-sm text-white/30 max-w-md mx-auto">
          Sahur Mode activates between 3:00–4:00 AM in your local timezone.
          Triple XP. Exclusive puzzles. Bat cursor. TUNG TUNG TUNG.
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'var(--doctrine-bg-tertiary)' }}>
          <Clock size={14} className="text-white/30" />
          <span className="text-sm font-mono text-white/40">
            {sahurCountdown > 0
              ? `${Math.floor(sahurCountdown / 60)}h ${sahurCountdown % 60}m until Sahur`
              : 'Calculating...'}
          </span>
        </div>
      </div>

      <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-xs font-mono uppercase tracking-wider text-white/40">What happens during Sahur</h3>
        <ul className="text-xs text-white/30 space-y-1">
          <li>• All XP earned is multiplied by {SAHUR_WINDOW.xpMultiplier}x</li>
          <li>• An exclusive puzzle appears (no archive, no replays)</li>
          <li>• The entire UI transforms with the Sahur theme</li>
          <li>• Participation earns a unique daily badge on your profile</li>
          <li>• The cursor becomes a baseball bat</li>
        </ul>
      </div>
    </div>
  );
}
