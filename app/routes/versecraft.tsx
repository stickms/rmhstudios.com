import { createFileRoute, Outlet } from '@tanstack/react-router'

function VersecraftLayout() {
  return (
    <div style={{ '--font-eb-garamond': '"EB Garamond", serif' } as React.CSSProperties}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400..800&display=swap"
      />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/versecraft')({
  component: VersecraftLayout,
})
