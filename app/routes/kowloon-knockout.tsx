import { createFileRoute, Outlet } from '@tanstack/react-router'

function KowloonKnockoutLayout() {
  return (
    <div style={{ fontFamily: '"Press Start 2P", cursive', width: '100vw', height: '100vh' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
      />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/kowloon-knockout')({
  component: KowloonKnockoutLayout,
})
