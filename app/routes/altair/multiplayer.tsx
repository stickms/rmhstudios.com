/**
 * Altair Multiplayer Layout
 *
 * Inherits auth gate and AltairShell from parent /altair/ layout.
 * Provides multiplayer-specific pass-through layout.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

function AltairMultiplayerLayout() {
  return <Outlet />
}

export const Route = createFileRoute('/altair/multiplayer')({
  component: AltairMultiplayerLayout,
})
