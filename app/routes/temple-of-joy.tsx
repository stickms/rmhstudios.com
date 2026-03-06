import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Cormorant_Garamond } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
})

function TempleOfJoyLayout() {
  return (
    <div className={`${cormorant.variable} font-sans`}>
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/temple-of-joy')({
  component: TempleOfJoyLayout,
})
