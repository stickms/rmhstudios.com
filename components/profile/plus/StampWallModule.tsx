import {
  lazy,
  Suspense,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import {
  Flag,
  Plus,
  Stamp as StampIcon,
  Minus,
} from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';
import type { StampView } from '@/lib/profile/stamps';
import { useJson } from './useJson';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  addStampToWallApi,
  removeStampFromWallApi,
} from '@/lib/profile/stamps.contract';

const ReportDialog =
  lazy(
    () =>
      import('@/components/moderation/ReportDialog').then(
        (
          m,
        ) => ({
          default:
            m.ReportDialog,
        }),
      ),
  );

/** One stamp, at its real size. Small pixel art stays crisp. */
export function StampImage({
  stamp,
  className,
}: {
  stamp: StampView;
  className?: string;
}) {
  return (
    <img
      src={
        stamp.imageUrl
      }
      alt={
        stamp.name
      }
      width={
        stamp.width
      }
      height={
        stamp.height
      }
      loading="lazy"
      decoding="async"
      className={
        className
      }
      style={{
        imageRendering:
          stamp.width <=
          64
            ? 'pixelated'
            : 'auto',
      }}
    />
  );
}

/**
 * P5 — a member's stamp wall. Tap a stamp to see who made it, add it to your own
 * wall, or report it (the existing report path, `entityType: 'stamp'`).
 */
export default function StampWallModule({
  title,
  userId,
  isOwner,
}: {
  title: string;
  userId: string;
  isOwner: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-profile-plus',
    );
  const {
    data: session,
  } =
    useSession();
  const signedIn =
    Boolean(
      session?.user,
    );
  const {
    data,
    setData,
  } =
    useJson<{
      stamps: StampView[];
    }>(
      `/api/profile/${encodeURIComponent(userId)}/stamps`,
    );
  const [
    open,
    setOpen,
  ] =
    useState<StampView | null>(
      null,
    );
  const [
    reporting,
    setReporting,
  ] =
    useState(
      false,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const stamps =
    data?.stamps ??
    [];
  if (
    data !==
      undefined &&
    stamps.length ===
      0 &&
    !isOwner
  )
    return null;

  async function toggle(
    stamp: StampView,
  ) {
    setBusy(
      true,
    );
    try {
      try {
        await api(
          stamp.onMyWall
            ? removeStampFromWallApi
            : addStampToWallApi,
          {
            params:
              {
                id: stamp.id,
              },
          },
        );
      } catch (e) {
        toast.error(
          serverError(
            e,
          ) ??
            t(
              'stamp-failed',
              {
                defaultValue:
                  "Couldn't update your wall",
              },
            ),
        );
        return;
      }
      const next =
        {
          ...stamp,
          onMyWall:
            !stamp.onMyWall,
        };
      setOpen(
        next,
      );
      if (
        data
      ) {
        setData(
          {
            stamps:
              data.stamps.map(
                (
                  s,
                ) =>
                  s.id ===
                  stamp.id
                    ? next
                    : s,
              ),
          },
        );
      }
      toast.success(
        next.onMyWall
          ? t(
              'stamp-added',
              {
                defaultValue:
                  'Added to your wall',
              },
            )
          : t(
              'stamp-removed',
              {
                defaultValue:
                  'Removed from your wall',
              },
            ),
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <WidgetFrame
      title={
        title
      }
      icon={
        StampIcon
      }
      loading={
        data ===
        undefined
      }
      empty={
        data !==
          undefined &&
        stamps.length ===
          0
      }
      emptyTitle={t(
        'stamps-empty',
        {
          defaultValue:
            'No stamps yet',
        },
      )}
      emptyDescription={t(
        'stamps-empty-desc',
        {
          defaultValue:
            'Make a stamp or collect other members’ stamps.',
        },
      )}
      emptyAction={
        <Button
          asChild
          variant="default"
          size="sm"
        >
          <Link to="/settings/profile">
            {t(
              'stamps-manage',
              {
                defaultValue:
                  'Get stamps',
              },
            )}
          </Link>
        </Button>
      }
    >
      <ul className="flex flex-wrap items-center gap-2">
        {stamps.map(
          (
            stamp,
          ) => (
            <li
              key={
                stamp.id
              }
            >
              <button
                type="button"
                onClick={() =>
                  setOpen(
                    stamp,
                  )
                }
                className="block rounded-site-sm p-0.5 hover:bg-site-surface-hover"
                aria-label={t(
                  'stamp-open',
                  {
                    name: stamp.name,
                    defaultValue:
                      'Stamp: {{name}}',
                  },
                )}
              >
                <StampImage
                  stamp={
                    stamp
                  }
                />
              </button>
            </li>
          ),
        )}
      </ul>

      <Dialog
        open={
          open !==
          null
        }
        onOpenChange={(
          o,
        ) =>
          !o &&
          setOpen(
            null,
          )
        }
      >
        <DialogContent className="sm:max-w-sm">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {
                    open.name
                  }
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'stamp-by',
                    {
                      name:
                        open
                          .creator
                          .name ??
                        open
                          .creator
                          .handle ??
                        '',
                      defaultValue:
                        'Made by {{name}}',
                    },
                  )}
                  {
                    ' · '
                  }
                  {t(
                    'stamp-collected',
                    {
                      count:
                        open.addCount,
                      defaultValue_one:
                        'on {{count}} wall',
                      defaultValue:
                        'on {{count}} walls',
                    },
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-2">
                <StampImage
                  stamp={
                    open
                  }
                />
              </div>
              <DialogFooter>
                {signedIn ? (
                  <>
                    <Button
                      variant={
                        open.onMyWall
                          ? 'default'
                          : 'default'
                      }
                      loading={
                        busy
                      }
                      onClick={() =>
                        void toggle(
                          open,
                        )
                      }
                    >
                      {open.onMyWall ? (
                        <Minus
                          aria-hidden
                        />
                      ) : (
                        <Plus
                          aria-hidden
                        />
                      )}
                      {open.onMyWall
                        ? t(
                            'stamp-remove',
                            {
                              defaultValue:
                                'Remove from my wall',
                            },
                          )
                        : t(
                            'stamp-add',
                            {
                              defaultValue:
                                'Add to my wall',
                            },
                          )}
                    </Button>
                    {open
                      .creator
                      .id !==
                    session
                      ?.user
                      ?.id ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setReporting(
                            true,
                          )
                        }
                      >
                        <Flag
                          aria-hidden
                        />
                        {t(
                          'stamp-report',
                          {
                            defaultValue:
                              'Report',
                          },
                        )}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-site-text-muted">
                    {t(
                      'stamp-sign-in',
                      {
                        defaultValue:
                          'Sign in to collect stamps.',
                      },
                    )}
                  </p>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {reporting &&
      open ? (
        <Suspense
          fallback={
            null
          }
        >
          <ReportDialog
            open={
              reporting
            }
            onOpenChange={
              setReporting
            }
            entityType="stamp"
            entityId={
              open.id
            }
          />
        </Suspense>
      ) : null}
    </WidgetFrame>
  );
}
