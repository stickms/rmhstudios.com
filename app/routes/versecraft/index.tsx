/**
 * Versecraft Page
 *
 * Checks auth status server-side and passes it to the client component.
 */

import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary'
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback'

const VersecraftClient = lazy(() => import('@/components/versecraft/VersecraftClient').then(m => ({ default: m.VersecraftClient })))

const checkLoginStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
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
