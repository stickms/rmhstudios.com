import { createFileRoute, Outlet } from '@tanstack/react-router'

function RmhFarmingSimLayout() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
      />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/rmh-farming-sim')({
  component: RmhFarmingSimLayout,
})
