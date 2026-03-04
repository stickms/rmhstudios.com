'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Edit, GripVertical, Ban } from 'lucide-react';

interface Build {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    status: string;
    visibility: string;
    position: number;
    user: { name: string | null; username: string | null };
    category?: { name: string } | null;
}

interface CuratedBuildsClientProps {
    initialBuilds: Build[];
}

function SortableBuildItem({ build }: { build: Build }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: build.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`p-4 flex items-center gap-4 transition-colors group bg-site-surface ${isDragging ? 'shadow-lg border border-site-accent/50 rounded-xl relative' : ''}`}
        >
            <div 
                {...attributes} 
                {...listeners} 
                className="text-site-text-dim/50 cursor-grab hover:text-site-text-dim active:cursor-grabbing p-1 -ml-1"
            >
                <GripVertical className="w-5 h-5" />
            </div>
            
            <div className="flex-1 flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-site-bg overflow-hidden flex-shrink-0 relative border border-site-border">
                    {build.thumbnailUrl ? (
                        <Image 
                            src={build.thumbnailUrl} 
                            alt={build.title} 
                            fill 
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-linear-to-br from-site-surface to-site-surface-hover flex items-center justify-center">
                            <span className="text-xs font-bold text-site-text-dim">{build.title.charAt(0)}</span>
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-site-text truncate">{build.title}</h3>
                        <span className="text-xs bg-site-accent-dim text-site-accent px-2 py-0.5 rounded-full whitespace-nowrap">
                            Position {build.position}
                        </span>
                    </div>
                    <p className="text-sm text-site-text-dim truncate mt-0.5">
                        by @{build.user.username || 'unknown'} • {build.status} • {build.visibility}
                    </p>
                </div>
            </div>

            <div className="w-32 flex-shrink-0">
                <span className="text-sm text-site-text-dim px-2.5 py-1 bg-site-bg rounded-md border border-site-border">
                    {build.category?.name || 'Uncategorized'}
                </span>
            </div>

            <div className="w-24 flex-shrink-0 flex justify-end gap-2 text-right">
                <Link 
                    href={`/admin/curated-builds/${build.id}/edit`}
                    className="p-2 text-site-text-muted hover:text-site-accent hover:bg-site-surface transition-colors rounded-lg relative z-20"
                    title="Edit Build"
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking link
                >
                    <Edit className="w-4 h-4" />
                </Link>
                <button 
                    className="p-2 text-site-text-muted hover:text-red-400 hover:bg-site-surface transition-colors rounded-lg relative z-20"
                    title="Remove Curation"
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking button
                >
                    <Ban className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export function CuratedBuildsClient({ initialBuilds }: CuratedBuildsClientProps) {
    const [builds, setBuilds] = useState(initialBuilds);
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Start dragging after moving 5px
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setBuilds((items) => {
                const oldIndex = items.findIndex(item => item.id === active.id);
                const newIndex = items.findIndex(item => item.id === over.id);
                
                // Move the item locally
                const newItems = arrayMove(items, oldIndex, newIndex);
                
                // Keep the positions synced array order
                const updatedItems = newItems.map((item, index) => ({
                    ...item,
                    position: index, // Start at 0 or 1, using index
                }));

                saveNewOrder(updatedItems);
                return updatedItems;
            });
        }
    };

    const saveNewOrder = async (newBuilds: Build[]) => {
        setIsSaving(true);
        try {
            const updates = newBuilds.map(b => ({ id: b.id, position: b.position }));
            
            const response = await fetch('/api/admin/curated-builds/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
            });

            if (!response.ok) {
                throw new Error('Failed to update order');
            }

            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to save the new order.');
            // Revert on error?
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden relative">
            {isSaving && (
                <div className="absolute top-0 inset-x-0 h-1 bg-site-accent/20 overflow-hidden z-50">
                    <div className="h-full bg-site-accent animate-pulse" style={{ width: '50%', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
                </div>
            )}
            <div className="p-4 border-b border-site-border bg-site-bg/50">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 text-xs font-semibold text-site-text-dim uppercase tracking-wider">
                    <div className="w-8 flex items-center justify-center">#</div>
                    <div>Build</div>
                    <div className="w-32">Category</div>
                    <div className="w-24 text-right">Actions</div>
                </div>
            </div>

            <div className="divide-y divide-site-border flex flex-col">
                <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext 
                        items={builds.map(b => b.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {builds.map((build) => (
                            <SortableBuildItem key={build.id} build={build} />
                        ))}
                    </SortableContext>
                </DndContext>
                
                {builds.length === 0 && (
                    <div className="p-8 text-center text-site-text-muted">
                        No curated builds found. You can curate community builds from the User Builds moderation page.
                    </div>
                )}
            </div>
            <style jsx global>{`
                @keyframes shimmer {
                    100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
}
