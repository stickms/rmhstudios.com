'use client';

interface Props { token: string; }

export default function SharedNoteView({ token }: Props) {
  void token;
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FEF9F0' }}>
      <div className="text-center max-w-md p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: '#2C1F0F' }}>Sharing not available</h1>
        <p style={{ color: '#7A6451' }}>
          This app runs in offline mode. Shared note links are not supported.
          Notes are stored locally in your browser.
        </p>
        <a href="/secret/notes" className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#C17F3A', color: '#FFFDF8' }}>
          Go to RMHNotes
        </a>
      </div>
    </div>
  );
}
