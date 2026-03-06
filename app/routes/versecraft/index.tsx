/**
 * Versecraft Page
 *
 * Checks auth status server-side and passes it to the client component.
 */

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'
import { VersecraftClient } from '@/components/versecraft/VersecraftClient'

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
      <VersecraftClient isLoggedIn={isLoggedIn} />
    </div>
  )
}

export const Route = createFileRoute('/versecraft/')({
  loader: () => checkLoginStatus(),
  component: VersecraftPage,
})
