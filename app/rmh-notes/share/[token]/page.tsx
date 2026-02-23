import SharedNoteView from '@/components/rmh-notes/SharedNoteView';

export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedNoteView token={token} />;
}
