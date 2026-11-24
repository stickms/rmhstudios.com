import { ClipboardCheck, Send } from 'lucide-react';
import type { MilestoneType } from '../../engine/tracker';
import { StatusIcon } from '../status/StatusIcon';
import { statusOfMilestone } from '../status/status';

/**
 * A milestone's disc: its status colour and icon when it has one, otherwise (application submitted, complete) the same
 * disc in the quiet ground with a neutral icon, so every step in a list has one shape. Always beside its words.
 */
export function StepIcon({ type }: { type: MilestoneType }) {
  const status = statusOfMilestone(type);
  if (status) return <StatusIcon status={status} size="sm" />;
  const Icon = type === 'COMPLETE' ? ClipboardCheck : Send;
  return (
    <span className="medapp-status-icon medapp-status-icon--sm medapp-status--plain" aria-hidden="true">
      <Icon aria-hidden="true" strokeWidth={2.2} />
    </span>
  );
}
