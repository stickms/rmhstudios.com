import { createFileRoute, Outlet } from '@tanstack/react-router'
import { EB_Garamond } from 'next/font/google'

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-eb-garamond',
})

function VersecraftLayout() {
  return (
    <div className={`${ebGaramond.variable}`}>
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/versecraft')({
  component: VersecraftLayout,
})
