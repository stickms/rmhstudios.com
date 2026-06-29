// app/routes/daily/index.tsx
import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useDeskSlot } from '../daily';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';

function DailyIndex() {
  const setSlot = useDeskSlot();
  useEffect(() => {
    useDeskStore.getState().setFocusedMode(null);
    setSlot(null);
    return () => setSlot(null);
  }, [setSlot]);
  return null;
}

export const Route = createFileRoute('/daily/')({
  component: DailyIndex,
});
