import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonGate } from '@/components/ComingSoonGate';

export const Route = createFileRoute('/_site/')({
  component: ComingSoonGate,
});
