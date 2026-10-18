'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The profile card (P10): a preview of the QR business-card image and a
 * download button. The PNG is rendered on demand by `/api/profile/$id/card` and
 * cached, so opening this dialog is the only thing that ever asks for it.
 */
export default function ProfileCardDialog({
  open,
  onOpenChange,
  handleOrId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleOrId: string;
}) {
  const { t } = useTranslation('f-profile-plus');
  const [loaded, setLoaded] = useState(false);
  const src = `/api/profile/${encodeURIComponent(handleOrId)}/card`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('card-title', { defaultValue: 'Your profile card' })}</DialogTitle>
          <DialogDescription>
            {t('card-description', {
              defaultValue:
                'A shareable image with a QR code that opens your profile. Print it, post it, or keep it on your phone.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-site-sm">
          {!loaded ? <Skeleton className="absolute inset-0" /> : null}
          <img
            src={src}
            alt={t('card-alt', { defaultValue: 'Your profile card with a QR code' })}
            width={1200}
            height={630}
            className="size-full object-cover"
            onLoad={() => setLoaded(true)}
          />
        </div>
        <DialogFooter>
          <Button asChild variant="accent">
            <a href={`${src}?download=1`} download>
              <Download aria-hidden />
              {t('card-download', { defaultValue: 'Download PNG' })}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
