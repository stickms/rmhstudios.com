/**
 * RMHbox Lobby Page
 *
 * Placeholder lobby/game room page.
 * Will render the waiting room and active game view in Phase 2.
 */

export default async function LobbyPage({ params }: { params: Promise<{ lobbyId: string }> }) {
  const { lobbyId } = await params;
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">Lobby: {lobbyId}</h1>
    </div>
  );
}
