import { Link, useRouterState } from '@tanstack/react-router';
import { Shield, Puzzle, AlertTriangle, Moon, User, BarChart3, Trophy, Home } from 'lucide-react';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { CURRENT_PHASE } from '@/lib/doctrine/constants';

const NAV_ITEMS = [
  { to: '/strategies', icon: Home, label: 'Dashboard' },
  { to: '/strategies/puzzles', icon: Puzzle, label: 'Puzzles' },
  { to: '/strategies/safehouse', icon: Shield, label: 'Safehouse' },
  { to: '/strategies/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/strategies/sahur', icon: Moon, label: 'Sahur' },
  { to: '/strategies/puzzles/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { to: '/strategies/profile', icon: User, label: 'Profile' },
] as const;

export function DoctrineNav() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { sahurActive, activeIncidentCount } = useDoctrineStore();

  return (
    <nav className="flex flex-col h-full">
      {/* Logo / Phase */}
      <div className="p-4 border-b border-white/10">
        <Link to="/strategies" className="block">
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--doctrine-accent, #F97316)' }}>
            RMH Strategies
          </h2>
          <p className="text-[10px] font-mono text-white/40 mt-0.5">
            {CURRENT_PHASE.name}
          </p>
        </Link>
      </div>

      {/* Nav Items */}
      <div className="flex-1 py-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.to || (item.to !== '/strategies' && pathname.startsWith(item.to));
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-white bg-white/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>

              {/* Sahur indicator */}
              {item.label === 'Sahur' && sahurActive && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 animate-pulse">
                  LIVE
                </span>
              )}

              {/* Incident count */}
              {item.label === 'Incidents' && activeIncidentCount > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  {activeIncidentCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
