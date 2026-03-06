import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Press_Start_2P } from 'next/font/google'

const pressStart2P = Press_Start_2P({ weight: '400', subsets: ['latin'] })

function KowloonKnockoutLayout() {
  return (
    <div className={pressStart2P.className} style={{ width: '100vw', height: '100vh' }}>
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/kowloon-knockout')({
  component: KowloonKnockoutLayout,
})
