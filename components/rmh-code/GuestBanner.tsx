'use client';

import Link from 'next/link';
import { LogIn } from 'lucide-react';

export default function GuestBanner() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#1e1e1e] border-b border-[#454545] shrink-0">
      <p className="text-xs text-[#ccc]">
        You are in <span className="text-[#007acc] font-semibold">read-only</span> mode. Sign in to save your work.
      </p>
      <Link
        href="/login?callbackUrl=/rmh-code"
        className="flex items-center gap-1.5 px-3 py-1 bg-[#007acc] hover:bg-[#1a8ad4] text-white text-xs rounded transition-colors shrink-0"
      >
        <LogIn size={12} />
        Sign In
      </Link>
    </div>
  );
}
