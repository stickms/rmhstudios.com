import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import KowloonKnockout from '@/components/kowloon-knockout/KowloonKnockout'

function KowloonKnockoutPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="absolute top-3 left-3 z-50">
        <Link to="/builds">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
      </div>
      <div className="grow relative overflow-hidden">
        <KowloonKnockout />
      </div>
    </main>
  )
}

export const Route = createFileRoute('/kowloon-knockout/')({
  component: KowloonKnockoutPage,
})
