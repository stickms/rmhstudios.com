import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { JsonBlock } from '@/components/admin/JsonBlock';
import { apiQuery } from '@/lib/contract/client';
import { getAdminJobApi } from '@/lib/admin/jobs.contract';
import {
  actionsFor,
  formatUtc,
  type JobAction,
} from '@/lib/admin/jobs';

/** One job: its data and output as formatted JSON, its timestamps, and the actions its state allows. */
export function JobDetailDialog({
  queue,
  id,
  onClose,
  onAction,
}: {
  queue: string;
  /** The open job's id; null keeps the dialog closed. */
  id:
    | string
    | null;
  onClose: () => void;
  onAction: (
    action: JobAction,
    id: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin-jobs',
    );
  const {
    data,
    isPending,
    isError,
  } =
    useQuery(
      {
        ...apiQuery(
          getAdminJobApi,
          {
            params:
              {
                queue,
                id:
                  id ??
                  '',
              },
          },
        ),
        enabled:
          id !==
          null,
      },
    );
  // M9: the details replace the skeleton, so they fade in when they arrive.
  const arrival = useArrival(!isPending);
  const job =
    data?.job;
  const none =
    t(
      'detail-none',
      {
        defaultValue:
          'None',
      },
    );
  const time =
    (
      iso:
        | string
        | null,
    ) =>
      formatUtc(
        iso,
      ) ||
      none;

  return (
    <Dialog
      open={
        id !==
        null
      }
      onOpenChange={(
        open,
      ) =>
        !open &&
        onClose()
      }
    >
      <DialogContent
        className="max-w-2xl"
        aria-describedby="job-detail-desc"
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              'detail-title',
              {
                defaultValue:
                  'Job',
              },
            )}
          </DialogTitle>
          <DialogDescription
            id="job-detail-desc"
            className="t-meta break-all"
          >
            {
              queue
            }{' '}
            ·{' '}
            {
              id
            }
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div
            className="space-y-2"
            aria-busy="true"
          >
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ||
          !job ? (
          <p
            role="alert"
            className="t-body text-site-danger"
          >
            {t(
              'detail-error',
              {
                defaultValue:
                  'This job could not be loaded. It may have been deleted.',
              },
            )}
          </p>
        ) : (
          <div className={cn('max-h-[70vh] space-y-4 overflow-y-auto', arrival)}>
            <dl className="t-meta grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt>
                {t(
                  'detail-state',
                  {
                    defaultValue:
                      'State',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {
                  job.state
                }
              </dd>
              <dt>
                {t(
                  'detail-created',
                  {
                    defaultValue:
                      'Created',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {time(
                  job.createdOn,
                )}
              </dd>
              <dt>
                {t(
                  'detail-start-after',
                  {
                    defaultValue:
                      'Runs after',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {time(
                  job.startAfter,
                )}
              </dd>
              <dt>
                {t(
                  'detail-started',
                  {
                    defaultValue:
                      'Started',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {time(
                  job.startedOn,
                )}
              </dd>
              <dt>
                {t(
                  'detail-finished',
                  {
                    defaultValue:
                      'Finished',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {time(
                  job.completedOn,
                )}
              </dd>
              <dt>
                {t(
                  'detail-retries',
                  {
                    defaultValue:
                      'Retries',
                  },
                )}
              </dt>
              <dd className="text-site-text">
                {
                  job.retryCount
                }{' '}
                /{' '}
                {
                  job.retryLimit
                }
              </dd>
              <dt>
                {t(
                  'detail-singleton',
                  {
                    defaultValue:
                      'Singleton key',
                  },
                )}
              </dt>
              <dd className="break-all text-site-text">
                {job.singletonKey ??
                  none}
              </dd>
              <dt>
                {t(
                  'detail-dead-letter',
                  {
                    defaultValue:
                      'Dead-letter queue',
                  },
                )}
              </dt>
              <dd className="break-all text-site-text">
                {job.deadLetter ??
                  none}
              </dd>
            </dl>
            {job.output ? (
              <JsonBlock
                label={t(
                  'detail-output',
                  {
                    defaultValue:
                      'Output or error',
                  },
                )}
                field={
                  job.output
                }
                truncatedNote={t(
                  'detail-truncated',
                  {
                    defaultValue:
                      'Truncated at 8 KB.',
                  },
                )}
              />
            ) : null}
            {job.data ? (
              <JsonBlock
                label={t(
                  'detail-data',
                  {
                    defaultValue:
                      'Data',
                  },
                )}
                field={
                  job.data
                }
                truncatedNote={t(
                  'detail-truncated',
                  {
                    defaultValue:
                      'Truncated at 8 KB.',
                  },
                )}
              />
            ) : (
              <p className="t-meta">
                {t(
                  'detail-no-data',
                  {
                    defaultValue:
                      'This job has no data.',
                  },
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                value={
                  job.id
                }
                variant="default"
                label={t(
                  'copy-id',
                  {
                    defaultValue:
                      'Copy job id',
                  },
                )}
              >
                {t(
                  'copy-id',
                  {
                    defaultValue:
                      'Copy job id',
                  },
                )}
              </CopyButton>
              {actionsFor(
                job.state,
              ).map(
                (
                  action,
                ) => (
                  <Button
                    key={
                      action
                    }
                    variant={
                      action ===
                      'delete'
                        ? 'danger'
                        : 'default'
                    }
                    onClick={() =>
                      onAction(
                        action,
                        job.id,
                      )
                    }
                  >
                    {action ===
                    'retry'
                      ? t(
                          'action-retry',
                          {
                            defaultValue:
                              'Retry',
                          },
                        )
                      : action ===
                          'cancel'
                        ? t(
                            'action-cancel',
                            {
                              defaultValue:
                                'Cancel job',
                            },
                          )
                        : t(
                            'action-delete',
                            {
                              defaultValue:
                                'Delete',
                            },
                          )}
                  </Button>
                ),
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
