/**
 * Slides Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import SlidesApp from '@/components/rmh-slides/SlidesApp';

export const Route = createFileRoute('/secret/slides/')({
  component: SlidesPage,
});

function SlidesPage() {
  return <SlidesApp />;
}
