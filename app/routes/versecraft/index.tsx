/**
 * Versecraft Page
 *
 * Checks auth status server-side and passes it to the client component.
 */

import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestSession } from '@/lib/auth-session.server'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { VersecraftClient } from '@/components/versecraft/VersecraftClient'

const checkLoginStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const session = await getRequestSession()
    return { isLoggedIn: !!session?.user?.id }
  } catch {
    return { isLoggedIn: false }
  }
})

function VersecraftPage() {
  const { isLoggedIn } = Route.useLoaderData()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1520' }}>
      <GameErrorBoundary gameName="Versecraft">
        <Suspense fallback={<GameLoadingFallback />}>
          <VersecraftClient isLoggedIn={isLoggedIn} />
        </Suspense>
      </GameErrorBoundary>
    </div>
  )
}

export const Route = createFileRoute('/versecraft/')({
  loader: () => checkLoginStatus(),
  component: VersecraftPage,
})
