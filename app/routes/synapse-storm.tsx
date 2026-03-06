import { createFileRoute } from '@tanstack/react-router'
import { SynapseStormGate } from '@/components/synapse-storm/SynapseStormGate'

function SynapseStormPage() {
  return <SynapseStormGate />
}

export const Route = createFileRoute('/synapse-storm')({
  component: SynapseStormPage,
})
