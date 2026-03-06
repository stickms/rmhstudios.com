import { Link } from '@tanstack/react-router';
import { Users, Hammer, ShieldCheck } from 'lucide-react';

export function AdminRightSidebar() {
  return (
    <div className="p-4 space-y-6">
      {/* Quick Links */}
      <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
        <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-site-accent" />
          Admin Quick Links
        </h2>
        <div className="space-y-2">
          <Link
            to="/admin/users"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
          >
            <div className={`w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0`}>
              <Users className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                Manage Users
              </p>
              <p className="text-xs text-site-text-dim">Roles & Verification</p>
            </div>
          </Link>
          <Link
            to="/admin/curated-builds"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
          >
            <div className={`w-8 h-8 rounded-lg bg-linear-to-br from-amber-500 to-red-500 flex items-center justify-center shrink-0`}>
              <Hammer className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                Curated Builds
              </p>
              <p className="text-xs text-site-text-dim">Official Games & Apps</p>
            </div>
          </Link>
          <Link
            to="/admin/user-builds"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
          >
            <div className={`w-8 h-8 rounded-lg bg-linear-to-br from-green-400 to-emerald-600 flex items-center justify-center shrink-0`}>
              <Hammer className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                User Builds
              </p>
              <p className="text-xs text-site-text-dim">Moderate Community</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <div className="text-xs text-site-text-dim px-2 space-y-1">
        <p>RMH | Admin Dashboard</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Link to="/" className="hover:text-site-text transition-colors">Return Home</Link>
        </div>
      </div>
    </div>
  );
}
