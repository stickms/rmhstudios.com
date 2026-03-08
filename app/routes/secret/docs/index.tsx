/**
 * Docs Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import DocsApp from '@/components/rmh-docs/DocsApp';

export const Route = createFileRoute('/secret/docs/')({
  component: DocsPage,
});

function DocsPage() {
  return <DocsApp />;
}
