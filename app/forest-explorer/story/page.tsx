import { StoryGame } from '@/components/forest-explorer/story/StoryGame';

export default function ForestExplorerStoryPage() {
    return (
        <main
            className="fixed inset-0 bg-black flex flex-col overflow-hidden"
            style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
            <div className="grow relative overflow-hidden">
                <StoryGame />
            </div>
        </main>
    );
}
