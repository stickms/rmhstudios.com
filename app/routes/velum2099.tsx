import { createFileRoute } from '@tanstack/react-router'
import { Velum2099Game } from '@/components/velum2099/Velum2099Game'

function Velum2099Page() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <Velum2099Game />
    </main>
  )
}

export const Route = createFileRoute('/velum2099')({
  component: Velum2099Page,
})
