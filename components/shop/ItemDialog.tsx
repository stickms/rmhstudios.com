import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ShopItemKind } from '@/lib/shop/catalog';
import { ItemStage } from './ItemStage';
import type { ItemArt } from './ItemPicture';

/**
 * An item's dialog, shared by the shop, the daily shop and the market: the item's name and
 * description, the large preview (`ItemStage`), its facts as rows on rules, then the actions.
 *
 * On a phone it is a full-height sheet (`mobileFullscreen`); the actions follow the facts, so the
 * primary is on screen without scrolling. Callers pass exactly one `variant="primary"` button in
 * `actions` (R4).
 */
export function ItemDialog({
  open,
  onOpenChange,
  kind,
  art,
  name,
  description,
  facts,
  note,
  actions,
}: {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  kind: ShopItemKind | null;
  art: ItemArt;
  name: string;
  description?: ReactNode;
  /** Label and value pairs, drawn as rows on rules. */
  facts: {
    label: string;
    value: ReactNode;
  }[];
  /** A line above the actions: why the primary is unavailable, or what happens next. */
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent
        mobileFullscreen
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            {
              name
            }
          </DialogTitle>
          {description ? (
            <DialogDescription>
              {
                description
              }
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <ItemStage
          kind={
            kind
          }
          art={
            art
          }
          name={
            name
          }
        />

        <dl className="border-t border-site-border">
          {facts.map(
            (
              fact,
            ) => (
              <div
                key={
                  fact.label
                }
                className="flex min-h-10 items-center justify-between gap-4 border-b border-site-border py-2"
              >
                <dt className="t-body text-site-text-muted">
                  {
                    fact.label
                  }
                </dt>
                <dd className="t-body min-w-0 text-end text-site-text">
                  {
                    fact.value
                  }
                </dd>
              </div>
            ),
          )}
        </dl>

        <div className="flex flex-col gap-3">
          {note ? (
            <p
              className="t-body text-site-text-muted"
              aria-live="polite"
            >
              {
                note
              }
            </p>
          ) : null}
          <DialogFooter className="[&>*]:w-full sm:[&>*]:w-auto">
            {
              actions
            }
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
