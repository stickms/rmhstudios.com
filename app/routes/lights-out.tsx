import { createFileRoute } from '@tanstack/react-router'
import { LightsOutGame } from '@/components/lights-out/LightsOutGame'

function LightsOutPage() {
  return (
    <div className="min-h-screen bg-site-bg text-site-text pt-8 pb-16">
      <LightsOutGame />
    </div>
  )
}

export const Route = createFileRoute('/lights-out')({
  component: LightsOutPage,
})
