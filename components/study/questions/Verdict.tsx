import { Check, X } from 'lucide-react';

/**
 * The outcome of a checked answer, in words and an icon, never colour alone. Flat: success and
 * danger are text colours (Steel), nothing is filled or glowing.
 */
export function Verdict({ right, children }: { right: boolean; children: React.ReactNode }) {
  const Icon = right ? Check : X;
  return (
    <p className={`t-body flex items-start gap-2 ${right ? 'text-site-success' : 'text-site-danger'}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
