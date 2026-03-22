import { createFileRoute } from '@tanstack/react-router';
import { RecruitForm } from '@/components/doctrine/safehouse/recruit-form';
import { UserPlus } from 'lucide-react';

export const Route = createFileRoute('/strategies/safehouse/recruit')({
  component: RecruitPage,
});

function RecruitPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <UserPlus size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Asset Recruitment
        </h1>
      </div>
      <p className="text-sm" style={{ color: 'var(--doctrine-text-muted)' }}>
        You don't sign up for this. You're recruited. Generate personalized invite links for targets
        whose skills would strengthen the coalition.
      </p>

      <RecruitForm />

      <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-xs font-mono uppercase tracking-wider text-white/40">How Recruitment Works</h3>
        <ul className="text-xs text-white/30 space-y-1">
          <li>1. Generate a personalized invite link with a custom message</li>
          <li>2. Share the link with your target recruit</li>
          <li>3. When they join, you earn 50 XP per signup</li>
          <li>4. If they convert to a paid tier, you earn 200 XP</li>
          <li>5. Links expire after 30 days or max uses</li>
        </ul>
      </div>
    </div>
  );
}
