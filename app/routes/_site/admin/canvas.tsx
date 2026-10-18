import { createFileRoute } from '@tanstack/react-router';
import { CanvasAdminPage } from '@/components/canvas/admin/CanvasAdminPage';

export const Route = createFileRoute('/_site/admin/canvas')({
  head: () => ({ meta: [{ title: 'Canvas | Admin | RMH Studios' }] }),
  component: CanvasAdminPage,
});
