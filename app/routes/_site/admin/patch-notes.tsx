import { createFileRoute } from '@tanstack/react-router';
import { AdminPatchNotes } from '@/components/arcade/AdminPatchNotes';

export const Route = createFileRoute('/_site/admin/patch-notes')({
  head: () => ({ meta: [{ title: 'Patch Notes | Admin | RMH Studios' }] }),
  component: AdminPatchNotes,
});
