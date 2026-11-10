import { Label } from '@/components/ui/label';

export function FieldHeader({
  htmlFor,
  label,
  hint,
  count,
}: {
  htmlFor?: string;
  label: string;
  hint?: string;
  count?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <div>
        {htmlFor ? (
          <Label htmlFor={htmlFor}>{label}</Label>
        ) : (
          <p className="text-sm font-medium text-site-text">{label}</p>
        )}
        {hint ? <p className="mt-1 text-xs text-site-text-dim">{hint}</p> : null}
      </div>
      {count ? (
        <span className="shrink-0 font-mono text-xs text-site-text-dim">{count}</span>
      ) : null}
    </div>
  );
}
