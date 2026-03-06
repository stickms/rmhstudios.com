/**
 * Notes Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import NotesApp from '@/components/rmh-notes/NotesApp';

export const Route = createFileRoute('/secret/notes/')({
  component: NotesPage,
});

function NotesPage() {
  return <NotesApp />;
}
