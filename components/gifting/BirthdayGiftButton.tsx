'use client';

/** "Use their birthday" for the scheduled-gift form (G1 × C7). Fills the date field. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/components/economy-plus/api';

/** `datetime-local` wants local wall-clock time, no zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BirthdayGiftButton({
  recipient,
  onPick,
}: {
  recipient: string;
  onPick: (localDateTime: string) => void;
}) {
  const { t } = useTranslation('f-gifting');
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={busy}
      disabled={recipient.trim().length === 0}
      onClick={async () => {
        setBusy(true);
        try {
          const { next } = await apiJson<{ next: string }>(
            `/api/birthday/next?handle=${encodeURIComponent(recipient.trim())}`,
          );
          onPick(toLocalInput(next));
        } catch {
          toast.error(t('birthday-gift-none', { defaultValue: "They haven't shared a birthday" }));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Cake />
      {t('birthday-gift-use', { defaultValue: 'Use their birthday' })}
    </Button>
  );
}
