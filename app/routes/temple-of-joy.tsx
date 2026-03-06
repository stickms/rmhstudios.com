import { createFileRoute, Outlet } from '@tanstack/react-router'

function TempleOfJoyLayout() {
  return (
    <div style={{ '--font-cormorant': '"Cormorant Garamond", serif' } as React.CSSProperties} className="font-sans">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap"
      />
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/temple-of-joy')({
  component: TempleOfJoyLayout,
})
