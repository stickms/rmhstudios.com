/**
 * StatBlock — Overview stat: eyebrow label above a big display-serif numeral.
 * Deliberately link-free; call sites wrap in <Link> when the stat navigates.
 */

export function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rl-stat">
      <p className="rl-eyebrow">{label}</p>
      <p className="rl-stat__value rl-display">{value}</p>
    </div>
  );
}
