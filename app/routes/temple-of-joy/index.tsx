import { createFileRoute } from '@tanstack/react-router'
import { TempleOfJoyGate } from '@/components/temple-of-joy/TempleOfJoyGate'

function TempleOfJoyPage() {
  return <TempleOfJoyGate />
}

export const Route = createFileRoute('/temple-of-joy/')({
  component: TempleOfJoyPage,
})
