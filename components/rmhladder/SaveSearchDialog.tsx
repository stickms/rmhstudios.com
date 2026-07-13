import { useState } from 'react';
import { BellRing, BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { ListJobsFilters } from '@/lib/rmhladder/server/queries';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SaveSearchDialog({ filters }: { filters: ListJobsFilters }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [alertsOn, setAlertsOn] = useState(true);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const response = await fetch('/api/rmhladder/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          alertsOn,
          filters: {
            preset: filters.preset,
            q: filters.q,
            cities: filters.cities,
            programTypes: filters.programTypes,
            sort: filters.sort,
          },
        }),
      });
      if (!response.ok) throw new Error('Could not save this search');
      toast.success('Search saved');
      setName('');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this search');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="min-h-11">
          <BookmarkPlus aria-hidden /> Save this search
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this search</DialogTitle>
          <DialogDescription>Reuse these filters and get notified when new verified roles match.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ladder-search-name">Search name</Label>
            <Input
              id="ladder-search-name"
              value={name}
              maxLength={100}
              placeholder="e.g. New York finance internships"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
              }}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 rounded-site-sm border border-site-border p-3 text-sm text-site-text">
            <input type="checkbox" checked={alertsOn} onChange={(event) => setAlertsOn(event.target.checked)} />
            <BellRing className="size-4 text-site-text-muted" aria-hidden />
            Alert me about new matches
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" loading={saving} loadingText="Saving…" disabled={!name.trim()} onClick={() => void save()}>
            Save search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
