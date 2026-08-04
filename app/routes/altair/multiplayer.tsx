/**
 * Altair Multiplayer Layout
 *
 * Inherits AltairShell from the parent /altair layout, and adds the one thing
 * the parent used to impose on the whole game: the auth gate. Co-op is a lobby
 * with a persistent identity in it, so this genuinely needs an account — but
 * only this. The run, the classes, the bestiary and the meta shop never did.
 *
 * The redirect here is a BACKSTOP, for a deep link or a bookmark. The ordinary
 * way in is the menu's MULTIPLAYER button, which asks with a modal and leaves
 * the game running underneath rather than throwing the screen away.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    throw redirect({ to: '/login', search: { callbackURL: '/altair/multiplayer' } })
  }
  return { user: session.user }
})

function AltairMultiplayerLayout() {
  return <Outlet />
}

export const Route = createFileRoute('/altair/multiplayer')({
  beforeLoad: () => checkAuth(),
  component: AltairMultiplayerLayout,
})
