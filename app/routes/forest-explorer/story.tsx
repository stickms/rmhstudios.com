import { createFileRoute } from '@tanstack/react-router'
import { StoryGame } from '@/components/forest-explorer/story/StoryGame'

function ForestExplorerStoryPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="grow relative overflow-hidden">
        <StoryGame />
      </div>
    </main>
  )
}

export const Route = createFileRoute('/forest-explorer/story')({
  component: ForestExplorerStoryPage,
})
